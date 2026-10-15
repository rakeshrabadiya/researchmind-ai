"""Offline Milestone 3 API coverage using deterministic in-memory PDFs."""

from __future__ import annotations

import io

import fitz
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_pdf(*page_texts: str) -> bytes:
    document = fitz.open()
    for text in page_texts:
        page = document.new_page()
        page.insert_textbox(fitz.Rect(50, 50, 545, 780), text, fontsize=11)
    result = document.tobytes()
    document.close()
    return result


def upload(text: str, filename: str = "paper.pdf") -> dict:
    response = client.post(
        "/api/papers/upload",
        files={"file": (filename, io.BytesIO(make_pdf(text)), "application/pdf")},
    )
    assert response.status_code == 200, response.text
    return response.json()


PAPER_A = (
    "Reliable Alpha Study\n"
    "By Ada Lovelace\n"
    "2024\n"
    "Research Problem\nFlood prediction is hard.\n"
    "Objectives\nWe evaluate robust models.\n"
    "Methodology\nControlled trial.\n"
    "Dataset\n100 samples.\n"
    "Evaluation Metrics\nAccuracy.\n"
    "Results\nAccuracy improved.\n"
    "Limitations\nThe sample size was small.\n"
    "Future Work\nInvestigate rural sites.\n"
    "An open question remains: does it generalize?"
)
PAPER_B = (
    "Reliable Beta Study\n"
    "Authors: Grace Hopper\n"
    "2023\n"
    "Research Problem\nFlood prediction is hard.\n"
    "Objectives\nWe evaluate transfer methods.\n"
    "Methodology\nField study.\n"
    "Dataset\n250 samples.\n"
    "Evaluation Metrics\nRecall.\n"
    "Results\nRecall improved.\n"
    "Limitations\nThe study used one region."
)


def test_library_lists_details_and_removes_one_paper() -> None:
    first = upload(PAPER_A, "alpha.pdf")
    second = upload(PAPER_B, "beta.pdf")

    listed = client.get("/api/papers")
    assert listed.status_code == 200
    assert [item["paper_id"] for item in listed.json()] == [second["paper_id"], first["paper_id"]]
    assert listed.json()[0]["paper"]["title"] == "Reliable Beta Study"

    detail = client.get(f"/api/papers/{first['paper_id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["pages"][0]["status"] == "text_extracted"
    title_evidence = next(item for item in body["field_evidence"] if item["field"] == "title")
    assert title_evidence["evidence"][0]["supporting_text"] == "Reliable Alpha Study"
    assert title_evidence["evidence"][0]["source_pages"] == [1]
    assert "text" not in body["pages"][0]

    removed = client.delete(f"/api/papers/{first['paper_id']}")
    assert removed.status_code == 200
    assert client.get(f"/api/papers/{first['paper_id']}").status_code == 404
    assert [item["paper_id"] for item in client.get("/api/papers").json()] == [second["paper_id"]]


def test_comparison_has_exact_values_and_page_evidence() -> None:
    first = upload(PAPER_A)
    second = upload(PAPER_B)
    response = client.post(
        "/api/research/compare",
        json={"selected_paper_ids": [first["paper_id"], second["paper_id"]]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["paper_ids"] == [first["paper_id"], second["paper_id"]]
    methodology = next(item for item in body["dimensions"] if item["name"] == "methodology")
    assert methodology["entries"][0]["value"] == "Controlled trial."
    assert methodology["entries"][0]["evidence"][0]["source_pages"] == [1]
    datasets = next(item for item in body["dimensions"] if item["name"] == "datasets/sample sizes")
    assert datasets["entries"][1]["value"] == "250 samples."


def test_cross_paper_search_includes_exact_snippet_and_page() -> None:
    first = upload(PAPER_A)
    second = upload("Beta Search Title\nThe generalize question differs.")
    response = client.get(
        "/api/research/search",
        params=[("q", "GENERALIZE"), ("paper_ids", first["paper_id"]), ("paper_ids", second["paper_id"])],
    )
    assert response.status_code == 200
    hits = response.json()["hits"]
    assert any(
        hit["paper_id"] == first["paper_id"]
        and "generalize" in hit["snippet"].casefold()
        and hit["source_pages"] == [1]
        for hit in hits
    )
    assert any(hit["paper_id"] == second["paper_id"] for hit in hits)


def test_gaps_use_only_documented_evidence_and_expose_empty_state() -> None:
    first = upload(PAPER_A)
    response = client.post("/api/research/gaps", json={"paper_ids": [first["paper_id"]]})
    assert response.status_code == 200
    gaps = response.json()["gaps"]
    assert any(gap["basis_type"] == "limitation" and "sample size" in gap["statement"] for gap in gaps)
    assert any(gap["basis_type"] == "future_research_direction" for gap in gaps)
    assert all(gap["evidence"][0]["source_pages"] == [1] for gap in gaps)
    assert all(gap["evidence"][0]["paper_id"] == first["paper_id"] for gap in gaps)
    assert all(gap["evidence"][0]["paper_title"] == "Reliable Alpha Study" for gap in gaps)

    empty = upload("No Gap Study\nResults\nThe result is stable.")
    no_gaps = client.post("/api/research/gaps", json={"paper_ids": [empty["paper_id"]]})
    assert no_gaps.status_code == 200
    assert no_gaps.json()["gaps"] == []
    assert "No documented" in no_gaps.json()["note"]


def test_report_contains_comparison_gaps_and_exact_evidence() -> None:
    first = upload(PAPER_A)
    second = upload(PAPER_B)
    response = client.post(
        "/api/research/report",
        json={"paper_ids": [first["paper_id"], second["paper_id"]]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["content_type"] == "text/markdown"
    assert body["filename"].endswith(".md")
    assert "## Comparison" in body["content"]
    assert "The sample size was small." in body["content"]
    assert "page 1" in body["content"]
    assert "no model-generated conclusions" in body["content"]


def test_invalid_selections_and_queries_are_rejected() -> None:
    paper = upload(PAPER_A)
    one = client.post("/api/research/compare", json={"paper_ids": [paper["paper_id"]]})
    assert one.status_code == 400
    duplicate = client.post(
        "/api/research/compare",
        json={"paper_ids": [paper["paper_id"], paper["paper_id"]]},
    )
    assert duplicate.status_code == 400
    unknown = client.post("/api/research/gaps", json={"paper_ids": ["paper-9999"]})
    assert unknown.status_code == 404
    blank_search = client.get("/api/research/search", params={"q": "   "})
    assert blank_search.status_code == 422
    unknown_delete = client.delete("/api/papers/paper-9999")
    assert unknown_delete.status_code == 404
