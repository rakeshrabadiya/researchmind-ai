"""Process-scoped in-memory paper library.

The library deliberately stores extracted text only for the lifetime of this
Python process. It does not persist uploaded PDFs, page content, or paths.
Restarting the service clears all papers.
"""

from __future__ import annotations

from dataclasses import dataclass
from threading import RLock

from .analysis import extract_field_evidence
from .extraction import ExtractedDocument, ExtractedPage
from .models import (
    EvidenceReference,
    FieldEvidence,
    PaperDetailResponse,
    PaperLibraryItem,
    UploadResponse,
)


@dataclass(frozen=True)
class StoredPaper:
    upload: UploadResponse
    pages: tuple[ExtractedPage, ...]
    field_evidence: dict[str, tuple[EvidenceReference, ...]]


class PaperLibrary:
    """Thread-safe, deterministic store for successful uploads."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._papers: dict[str, StoredPaper] = {}
        self._next_id = 1

    def add(self, upload: UploadResponse, document: ExtractedDocument) -> UploadResponse:
        with self._lock:
            paper_id = f"paper-{self._next_id:04d}"
            self._next_id += 1
            stored_upload = upload.model_copy(update={"paper_id": paper_id})
            evidence = extract_field_evidence(document, stored_upload.paper)
            paper_title = stored_upload.paper.title
            evidence_with_identity = {
                field: [
                    reference.model_copy(
                        update={"paper_id": paper_id, "paper_title": paper_title}
                    )
                    for reference in references
                ]
                for field, references in evidence.items()
            }
            self._papers[paper_id] = StoredPaper(
                upload=stored_upload,
                pages=document.pages,
                field_evidence={
                    field: tuple(references)
                    for field, references in evidence_with_identity.items()
                },
            )
            return stored_upload

    def list(self) -> list[StoredPaper]:
        with self._lock:
            # Dict insertion order is deterministic; reverse gives newest first.
            return list(reversed(self._papers.values()))

    def get(self, paper_id: str) -> StoredPaper | None:
        with self._lock:
            return self._papers.get(paper_id)

    def remove(self, paper_id: str) -> bool:
        with self._lock:
            return self._papers.pop(paper_id, None) is not None

    def clear(self) -> None:
        """Clear state for tests and explicit process-local reset scenarios."""
        with self._lock:
            self._papers.clear()
            self._next_id = 1

    @staticmethod
    def as_library_item(stored: StoredPaper) -> PaperLibraryItem:
        return PaperLibraryItem(
            paper_id=stored.upload.paper_id or "",
            filename=stored.upload.filename,
            mime_type=stored.upload.mime_type,
            byte_size=stored.upload.byte_size,
            page_count=stored.upload.page_count,
            extracted_text_length=stored.upload.extracted_text_length,
            image_only_pages=stored.upload.image_only_pages,
            ocr_unavailable=stored.upload.ocr_unavailable,
            warnings=stored.upload.warnings,
            pages=stored.upload.pages,
            paper=stored.upload.paper,
        )

    @staticmethod
    def as_detail(stored: StoredPaper) -> PaperDetailResponse:
        item = PaperLibrary.as_library_item(stored)
        evidence = {
            field: list(references) for field, references in stored.field_evidence.items()
        }
        return PaperDetailResponse(
            **item.model_dump(),
            field_evidence=[
                FieldEvidence(field=field, value=getattr(stored.upload.paper, field), evidence=list(refs))
                for field, refs in stored.field_evidence.items()
            ],
            evidence=evidence,
        )


paper_library = PaperLibrary()


def clear_library() -> None:
    """Public test helper; all state remains process-scoped."""
    paper_library.clear()
