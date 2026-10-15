"""Safe, local PDF text extraction.

PyMuPDF is used only to parse a temporary PDF and read page text. Nothing in
the document is executed or interpreted as instructions. OCR is deliberately
not part of this milestone.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz


class DocumentValidationError(ValueError):
    """Raised when a file is not a usable, non-empty PDF document."""


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str
    status: str
    text_length: int
    image_only: bool


@dataclass(frozen=True)
class ExtractedDocument:
    pages: tuple[ExtractedPage, ...]
    image_only_pages: tuple[int, ...]
    ocr_unavailable: bool
    warnings: tuple[str, ...]

    @property
    def full_text_length(self) -> int:
        return sum(page.text_length for page in self.pages)


def extract_document(path: Path) -> ExtractedDocument:
    """Read real text from every page without executing document content.

    The caller owns ``path`` and is responsible for removing it in a finally
    block. A malformed file, an unreadable page, or a PDF with no pages is
    rejected rather than silently producing partial evidence.
    """

    try:
        document = fitz.open(filename=str(path))
    except (fitz.FileDataError, ValueError, RuntimeError) as exc:
        raise DocumentValidationError("The uploaded file is not a valid PDF") from exc

    try:
        if document.page_count < 1:
            raise DocumentValidationError("The PDF must contain at least one page")

        pages: list[ExtractedPage] = []
        image_only_pages: list[int] = []
        for page_index in range(document.page_count):
            try:
                page = document.load_page(page_index)
                text = page.get_text("text", sort=True)
                # An image-only page has no text layer but does contain an
                # image. A genuinely blank page is reported as empty instead.
                has_images = bool(page.get_images(full=True))
            except (fitz.FileDataError, ValueError, RuntimeError) as exc:
                raise DocumentValidationError("The PDF contains an unreadable page") from exc

            cleaned_text = text if isinstance(text, str) else str(text)
            image_only = not cleaned_text.strip() and has_images
            if image_only:
                status = "image_only"
                image_only_pages.append(page_index + 1)
            elif cleaned_text.strip():
                status = "text_extracted"
            else:
                status = "empty"
            pages.append(
                ExtractedPage(
                    page_number=page_index + 1,
                    text=cleaned_text,
                    status=status,
                    text_length=len(cleaned_text),
                    image_only=image_only,
                )
            )
    finally:
        document.close()

    warnings: tuple[str, ...] = ()
    if image_only_pages:
        warnings = (
            "OCR is unavailable; image-only pages have no extractable text.",
        )
    return ExtractedDocument(
        pages=tuple(pages),
        image_only_pages=tuple(image_only_pages),
        ocr_unavailable=bool(image_only_pages),
        warnings=warnings,
    )
