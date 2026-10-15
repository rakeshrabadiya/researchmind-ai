"""Pydantic contracts for paper uploads and deterministic paper extraction."""

from pydantic import BaseModel, Field


class PageExtractionStatus(BaseModel):
    """Small, non-content status record for one 1-based PDF page."""

    page_number: int = Field(ge=1)
    status: str
    text_length: int = Field(ge=0)
    image_only: bool = False


class ImportantClaim(BaseModel):
    """A claim copied from the document, with enough provenance to verify it."""

    supporting_text: str
    source_pages: list[int] = Field(min_length=1)


class PaperExtraction(BaseModel):
    """Evidence-only structured fields.

    Every scalar field uses the literal ``Not reported`` when no matching
    evidence exists. This model intentionally contains no generated summary,
    citation, or inferred fact.
    """

    title: str
    authors: str
    publication_year: str
    abstract: str
    research_problem: str
    objectives: str
    methodology: str
    datasets_sample_sizes: str
    evaluation_metrics: str
    reported_results: str
    limitations: str
    future_research_directions: str
    important_claims: list[ImportantClaim]


class UploadResponse(BaseModel):
    """Metadata, extraction diagnostics, and conservative paper fields."""

    filename: str
    mime_type: str
    byte_size: int = Field(ge=0)
    page_count: int = Field(ge=1)
    extracted_text_length: int = Field(ge=0)
    pages: list[PageExtractionStatus]
    image_only_pages: list[int]
    ocr_unavailable: bool
    warnings: list[str]
    paper: PaperExtraction
