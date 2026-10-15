"""Offline API tests using PDFs generated in memory by PyMuPDF."""

from __future__ import annotations

import base64
import io

import fitz
from fastapi.testclient import TestClient

from app.main import app
from app.routes import MAX_UPLOAD_BYTES

client = TestClient(app)

# A deterministic 1x1 transparent PNG used to make an image-only PDF page.
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def make_pdf(*pages: tuple[str, bool]) -> bytes:
    document = fitz.open()
    for text, with_image in pages:
        page = document.new_page()
        if text:
            page.insert_text((72, 72), text, fontsize=12)
        if with_image:
            page.insert_image(fitz.Rect(72, 100, 172, 200), stream=TINY_PNG)
    result = document.tobytes()
    document.close()
    return result


def upload(content: bytes, filename: str = "study.pdf", content_type: str = "application/pdf"):
    return client.post(
        "/api/papers/upload",
        files={"file": (filename, io.BytesIO(content), content_type)},
    )


def test_upload_extracts_text_and_preserves_page_numbers() -> None:
    pdf = make_pdf(
        (
            "A Reliable Study\nBy Ada Lovelace and Grace Hopper\n2024\n"
            "Abstract\nWe study reliable systems.\n"
            "Methodology\nWe evaluated the dataset with accuracy.\n",
            False,
        ),
        (
            "Results\nWe found significant improvement. We conclude the method works.\n"
            "Limitations\nThe sample size was small.",
            False,
        ),
    )

    response = upload(pdf, "../private study.pdf")

    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "private study.pdf"
    assert body["mime_type"] == "application/pdf"
    assert body["byte_size"] == len(pdf)
    assert body["page_count"] == 2
    assert body["extracted_text_length"] > 0
    assert [page["page_number"] for page in body["pages"]] == [1, 2]
    assert body["pages"][0]["status"] == "text_extracted"
    assert body["paper"]["title"] == "A Reliable Study"
    assert body["paper"]["authors"] == "Ada Lovelace and Grace Hopper"
    assert body["paper"]["publication_year"] == "2024"
    assert "We evaluated the dataset" in body["paper"]["methodology"]
    assert body["paper"]["limitations"] == "The sample size was small."
    assert any(
        claim["supporting_text"] == "We found significant improvement."
        and claim["source_pages"] == [2]
        for claim in body["paper"]["important_claims"]
    )


def test_blank_pdf_is_valid_but_missing_evidence_is_not_reported() -> None:
    response = upload(make_pdf(("", False)))

    assert response.status_code == 200
    body = response.json()
    assert body["page_count"] == 1
    assert body["extracted_text_length"] == 0
    assert body["pages"] == [
        {"page_number": 1, "status": "empty", "text_length": 0, "image_only": False}
    ]
    assert body["paper"]["title"] == "Not reported"
    assert body["paper"]["abstract"] == "Not reported"
    assert body["paper"]["important_claims"] == []


def test_image_only_page_reports_ocr_unavailable() -> None:
    response = upload(make_pdf(("", True)))

    assert response.status_code == 200
    body = response.json()
    assert body["image_only_pages"] == [1]
    assert body["ocr_unavailable"] is True
    assert body["pages"][0]["status"] == "image_only"
    assert body["pages"][0]["image_only"] is True
    assert "OCR is unavailable" in body["warnings"][0]


def test_malformed_bytes_are_rejected() -> None:
    response = upload(b"%PDF-1.7\nnot actually a PDF")

    assert response.status_code == 422
    assert "valid PDF" in response.json()["detail"]


def test_pdf_magic_header_is_required() -> None:
    response = upload(b"not a pdf")

    assert response.status_code == 422
    assert "PDF header" in response.json()["detail"]


def test_extension_and_mime_type_are_enforced() -> None:
    pdf = make_pdf(("text", False))

    wrong_extension = upload(pdf, "study.txt")
    wrong_mime = upload(pdf, "study.pdf", "text/plain")

    assert wrong_extension.status_code == 415
    assert wrong_mime.status_code == 415


def test_upload_size_limit_is_enforced() -> None:
    response = upload(b"%PDF-1.7\n" + b"x" * MAX_UPLOAD_BYTES)

    assert response.status_code == 413
    assert "25 MiB" in response.json()["detail"]


def test_upload_requires_a_file_part() -> None:
    response = client.post("/api/papers/upload", data={})

    assert response.status_code == 422
    assert response.json()["detail"][0]["type"] == "missing"
