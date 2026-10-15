"""HTTP routes for paper ingestion."""

from __future__ import annotations

import re
import tempfile
import unicodedata
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from .analysis import analyze_deterministically
from .extraction import DocumentValidationError, extract_document
from .models import PageExtractionStatus, UploadResponse

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
        return UploadResponse(
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
    finally:
        await file.close()
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except OSError:
                pass
