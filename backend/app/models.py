"""Pydantic contracts for uploads and deterministic research intelligence."""

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


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


class EvidenceReference(BaseModel):
    """Exact source text and the 1-based pages on which it appears."""

    supporting_text: str = Field(min_length=1)
    source_pages: list[int] = Field(min_length=1)
    paper_id: str | None = None
    paper_title: str | None = None


class FieldEvidence(BaseModel):
    """Evidence for one conservative structured paper field."""

    field: str
    value: str
    evidence: list[EvidenceReference] = Field(default_factory=list)


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
    # Optional keeps the Milestone 2 contract valid for callers constructing it
    # directly; successful uploads always receive a concrete id.
    paper_id: str | None = None


class PaperLibraryItem(BaseModel):
    """Metadata and extracted fields safe to show in the paper library."""

    paper_id: str
    filename: str
    mime_type: str
    byte_size: int = Field(ge=0)
    page_count: int = Field(ge=1)
    extracted_text_length: int = Field(ge=0)
    image_only_pages: list[int]
    ocr_unavailable: bool
    warnings: list[str]
    pages: list[PageExtractionStatus]
    paper: PaperExtraction


class PaperDetailResponse(PaperLibraryItem):
    """Full stored metadata, including field-level provenance but no page text."""

    field_evidence: list[FieldEvidence]
    evidence: dict[str, list[EvidenceReference]]


class PaperSelectionRequest(BaseModel):
    """Selection body accepted by comparison, gaps, and report endpoints.

    ``selected_paper_ids`` is accepted as a readable alias for clients that
    use the wording from the product brief; responses and internal code use
    ``paper_ids`` consistently.
    """

    model_config = ConfigDict(extra="forbid")

    paper_ids: list[str] | None = Field(default=None, min_length=1, max_length=20)
    selected_paper_ids: list[str] | None = Field(default=None, min_length=1, max_length=20)

    @model_validator(mode="after")
    def require_one_selection(self) -> Self:
        if self.paper_ids is None and self.selected_paper_ids is None:
            raise ValueError("paper_ids must contain at least one paper id")
        if self.paper_ids is not None and self.selected_paper_ids is not None:
            raise ValueError("provide only paper_ids or selected_paper_ids")
        return self

    @property
    def selected_ids(self) -> list[str]:
        return self.paper_ids if self.paper_ids is not None else self.selected_paper_ids or []


class ComparisonEntry(BaseModel):
    """One paper's value in a side-by-side comparison dimension."""

    paper_id: str
    title: str
    value: str
    evidence: list[EvidenceReference] = Field(default_factory=list)


class ComparisonDimension(BaseModel):
    """A named comparison dimension with one entry per selected paper."""

    name: str
    dimension: str
    entries: list[ComparisonEntry]


class ComparisonResponse(BaseModel):
    paper_ids: list[str]
    papers: list[PaperLibraryItem]
    dimensions: list[ComparisonDimension]


class SearchHit(BaseModel):
    """A deterministic, exact text match from one stored PDF page."""

    paper_id: str
    title: str
    snippet: str
    supporting_text: str
    source_pages: list[int] = Field(min_length=1)


class SearchResponse(BaseModel):
    query: str
    paper_ids: list[str]
    hits: list[SearchHit]
    truncated: bool = False


class ResearchGap(BaseModel):
    """A gap copied from a limitation, future direction, or open question."""

    statement: str
    basis_type: str
    evidence: list[EvidenceReference] = Field(min_length=1)


class GapsResponse(BaseModel):
    paper_ids: list[str]
    gaps: list[ResearchGap]
    note: str | None = None


class ReportResponse(BaseModel):
    filename: str
    content_type: str
    content: str
