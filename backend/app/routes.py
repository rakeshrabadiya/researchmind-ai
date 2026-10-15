"""HTTP routes for paper ingestion and the deterministic paper library."""

from __future__ import annotations

import re
import tempfile
import unicodedata
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from .analysis import analyze_deterministically
from .extraction import DocumentValidationError, extract_document
from .intelligence import (
    MAX_SEARCH_QUERY_LENGTH,
    SelectionError,
    compare_papers,
    derive_gaps,
    generate_report,
    search_papers,
    selected_papers,
)
from .library import paper_library
from .models import (
    ComparisonResponse,
    GapsResponse,
    PageExtractionStatus,
    PaperDetailResponse,
    PaperLibraryItem,
    PaperSelectionRequest,
    ReportResponse,
    SearchResponse,
    UploadResponse,
)

router = APIRouter(prefix="/api/papers", tags=["papers"])
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
_CHUNK_SIZE = 1024 * 1024


def _display_filename(filename: str | None) -> str:
    """Sanitize a filename for display; it is never used as a filesystem path."""

    value = unicodedata.normalize("NFKC", filename or "")
    value = value.replace("\\", "/").rsplit("/", 1)[-1]
    value = "".join(char for char in value if char.isprintable() and char not in '<>:\"|?*')
    value = re.sub(r"\s+", " ", value).strip()[:255]
    return value or "document.pdf"


@router.post("/upload", response_model=UploadResponse)
async def upload_paper(file: UploadFile = File(...)) -> UploadResponse:
    """Validate, bound, and extract one PDF upload.

    The request stream is copied in bounded chunks to a unique temporary file.
    PyMuPDF only extracts text; embedded PDF actions/instructions are never
    executed. The temporary file is removed on every success and failure path.
    """

    display_name = _display_filename(file.filename)
    if not display_name.lower().endswith(".pdf"):
        await file.close()
        raise HTTPException(status_code=415, detail="Only .pdf filenames are accepted")
    if file.content_type != "application/pdf":
        await file.close()
        raise HTTPException(status_code=415, detail="The upload MIME type must be application/pdf")

    temporary_path: Path | None = None
    byte_size = 0
    try:
        content_length = file.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="PDF exceeds the 25 MiB upload limit")

        with tempfile.NamedTemporaryFile(prefix="researchmind-", suffix=".pdf", delete=False) as temporary:
            temporary_path = Path(temporary.name)
            first_chunk = True
            while True:
                chunk = await file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                if first_chunk:
                    first_chunk = False
                    if not chunk.startswith(b"%PDF-"):
                        raise HTTPException(status_code=422, detail="The upload is missing a valid PDF header")
                byte_size += len(chunk)
                if byte_size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="PDF exceeds the 25 MiB upload limit")
                temporary.write(chunk)
            if byte_size == 0:
                raise HTTPException(status_code=422, detail="The upload is empty")

        try:
            document = extract_document(temporary_path)
        except DocumentValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        paper = analyze_deterministically(document)
        upload = UploadResponse(
            filename=display_name,
            mime_type=file.content_type,
            byte_size=byte_size,
            page_count=len(document.pages),
            extracted_text_length=document.full_text_length,
            pages=[
                PageExtractionStatus(
                    page_number=page.page_number,
                    status=page.status,
                    text_length=page.text_length,
                    image_only=page.image_only,
                )
                for page in document.pages
            ],
            image_only_pages=list(document.image_only_pages),
            ocr_unavailable=document.ocr_unavailable,
            warnings=list(document.warnings),
            paper=paper,
        )
        return paper_library.add(upload, document)
    finally:
        await file.close()
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except OSError:
                pass


@router.get("", response_model=list[PaperLibraryItem])
def list_papers() -> list[PaperLibraryItem]:
    """List newest uploads first without exposing raw page text."""

    return [paper_library.as_library_item(stored) for stored in paper_library.list()]


@router.get("/{paper_id}", response_model=PaperDetailResponse)
def get_paper(paper_id: str) -> PaperDetailResponse:
    stored = paper_library.get(paper_id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"Unknown paper_id: {paper_id}")
    return paper_library.as_detail(stored)


@router.delete("/{paper_id}")
def delete_paper(paper_id: str) -> dict[str, str]:
    if not paper_library.remove(paper_id):
        raise HTTPException(status_code=404, detail=f"Unknown paper_id: {paper_id}")
    return {"paper_id": paper_id, "status": "deleted"}


research_router = APIRouter(prefix="/api/research", tags=["research"])


def _selection_or_http_error(
    paper_ids: list[str],
    *,
    minimum: int,
    maximum: int | None = None,
):
    try:
        return selected_papers(
            paper_library,
            paper_ids,
            minimum=minimum,
            maximum=maximum,
        )
    except SelectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@research_router.post("/compare", response_model=ComparisonResponse)
def compare_research(request: PaperSelectionRequest) -> ComparisonResponse:
    papers = _selection_or_http_error(request.selected_ids, minimum=2, maximum=10)
    return compare_papers(papers)


@research_router.get("/search", response_model=SearchResponse)
def search_research(
    q: str = Query(..., min_length=1, max_length=MAX_SEARCH_QUERY_LENGTH),
    paper_ids: list[str] | None = Query(default=None),
) -> SearchResponse:
    normalized_query = " ".join(q.split())
    if not normalized_query:
        raise HTTPException(status_code=422, detail="q must not be blank")
    ids: list[str]
    if paper_ids is not None:
        # Repeated query params and a convenient comma-separated form are both
        # deterministic and avoid requiring clients to encode JSON in a GET.
        ids = [item.strip() for raw in paper_ids for item in raw.split(",") if item.strip()]
        papers = _selection_or_http_error(ids, minimum=1, maximum=20)
    else:
        papers = paper_library.list()
        ids = [stored.upload.paper_id or "" for stored in papers]
    return search_papers(papers, normalized_query)


@research_router.post("/gaps", response_model=GapsResponse)
def research_gaps(request: PaperSelectionRequest) -> GapsResponse:
    papers = _selection_or_http_error(request.selected_ids, minimum=1, maximum=20)
    return derive_gaps(papers)


@research_router.post("/report", response_model=ReportResponse)
def research_report(request: PaperSelectionRequest) -> ReportResponse:
    papers = _selection_or_http_error(request.selected_ids, minimum=1, maximum=20)
    return generate_report(papers)
