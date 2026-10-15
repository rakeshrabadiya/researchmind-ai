"""Deterministic multi-paper comparison, search, gap, and report helpers."""

from __future__ import annotations

import re
from collections.abc import Sequence

from .analysis import NOT_REPORTED
from .extraction import ExtractedPage
from .library import PaperLibrary, StoredPaper
from .models import (
    ComparisonDimension,
    ComparisonEntry,
    ComparisonResponse,
    EvidenceReference,
    GapsResponse,
    PaperLibraryItem,
    ResearchGap,
    ReportResponse,
    SearchHit,
    SearchResponse,
)

MAX_COMPARE_PAPERS = 10
MAX_SEARCH_HITS = 50
MAX_SEARCH_QUERY_LENGTH = 200
_SENTENCE_RE = re.compile(r"[^.!?\n]+(?:[.!?](?=\s|$)|$)")


class SelectionError(ValueError):
    """A client supplied an invalid selection or unknown paper id."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def selected_papers(
    library: PaperLibrary,
    paper_ids: Sequence[str],
    *,
    minimum: int,
    maximum: int | None = None,
    reject_duplicates: bool = True,
) -> list[StoredPaper]:
    """Resolve IDs in caller order and provide useful HTTP-friendly errors."""

    ids = list(paper_ids)
    if len(ids) < minimum:
        raise SelectionError(f"select at least {minimum} paper(s)", 400)
    if maximum is not None and len(ids) > maximum:
        raise SelectionError(f"select no more than {maximum} papers", 422)
    if reject_duplicates and len(set(ids)) != len(ids):
        raise SelectionError("paper_ids must not contain duplicates", 400)

    selected: list[StoredPaper] = []
    for paper_id in ids:
        stored = library.get(paper_id)
        if stored is None:
            raise SelectionError(f"unknown paper_id: {paper_id}", 404)
        selected.append(stored)
    return selected


_COMPARISON_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("research objectives/problem", ("research_problem", "objectives")),
    ("methodology", ("methodology",)),
    ("datasets/sample sizes", ("datasets_sample_sizes",)),
    ("evaluation metrics", ("evaluation_metrics",)),
    ("reported results", ("reported_results",)),
    ("limitations", ("limitations",)),
)


def compare_papers(papers: Sequence[StoredPaper]) -> ComparisonResponse:
    dimensions: list[ComparisonDimension] = []
    for name, fields in _COMPARISON_FIELDS:
        entries: list[ComparisonEntry] = []
        for stored in papers:
            values = [getattr(stored.upload.paper, field) for field in fields]
            if len(fields) > 1:
                present = [value for value in values if value != NOT_REPORTED]
                value = "\n".join(present) if present else NOT_REPORTED
                evidence = [
                    reference
                    for field in fields
                    for reference in stored.field_evidence.get(field, ())
                ]
            else:
                value = values[0]
                evidence = list(stored.field_evidence.get(fields[0], ()))
            entries.append(
                ComparisonEntry(
                    paper_id=stored.upload.paper_id or "",
                    title=stored.upload.paper.title,
                    value=value,
                    evidence=evidence,
                )
            )
        dimensions.append(ComparisonDimension(name=name, dimension=name, entries=entries))

    return ComparisonResponse(
        paper_ids=[stored.upload.paper_id or "" for stored in papers],
        papers=[PaperLibrary.as_library_item(stored) for stored in papers],
        dimensions=dimensions,
    )


def _exact_lines_or_sentences(page: ExtractedPage, query: str) -> list[str]:
    """Return exact source substrings, preferring whole matching lines."""

    lowered = query.casefold()
    matches: list[str] = []
    for raw_line in page.text.splitlines():
        line = raw_line.strip()
        if line and lowered in line.casefold():
            matches.append(line)
    if matches:
        return matches
    for match in _SENTENCE_RE.finditer(page.text):
        sentence = match.group(0).strip()
        if sentence and lowered in sentence.casefold():
            matches.append(sentence)
    return matches


def search_papers(
    papers: Sequence[StoredPaper],
    query: str,
) -> SearchResponse:
    normalized_query = " ".join(query.split())
    hits: list[SearchHit] = []
    for stored in papers:
        for page in stored.pages:
            for snippet in _exact_lines_or_sentences(page, normalized_query):
                hits.append(
                    SearchHit(
                        paper_id=stored.upload.paper_id or "",
                        title=stored.upload.paper.title,
                        snippet=snippet,
                        supporting_text=snippet,
                        source_pages=[page.page_number],
                    )
                )
                if len(hits) >= MAX_SEARCH_HITS:
                    return SearchResponse(
                        query=normalized_query,
                        paper_ids=[stored.upload.paper_id or "" for stored in papers],
                        hits=hits,
                        truncated=True,
                    )
    return SearchResponse(
        query=normalized_query,
        paper_ids=[stored.upload.paper_id or "" for stored in papers],
        hits=hits,
    )


def _sentences(pages: Sequence[ExtractedPage]) -> list[tuple[str, int]]:
    result: list[tuple[str, int]] = []
    for page in pages:
        for match in _SENTENCE_RE.finditer(page.text):
            sentence = match.group(0).strip()
            if sentence:
                result.append((sentence, page.page_number))
    return result


def _section_sentence_set(value: str) -> set[str]:
    return {
        sentence.casefold()
        for sentence in _SENTENCE_RE.findall(value)
        if sentence.strip()
    }


def _gap_evidence(
    sentence: str, page_number: int, stored: StoredPaper
) -> list[EvidenceReference]:
    return [
        EvidenceReference(
            supporting_text=sentence,
            source_pages=[page_number],
            paper_id=stored.upload.paper_id,
            paper_title=stored.upload.paper.title,
        )
    ]


def derive_gaps(papers: Sequence[StoredPaper]) -> GapsResponse:
    gaps: list[ResearchGap] = []
    seen: set[tuple[str, str]] = set()
    for stored in papers:
        paper_id = stored.upload.paper_id or ""
        paper = stored.upload.paper
        for field, basis_type in (
            ("limitations", "limitation"),
            ("future_research_directions", "future_research_direction"),
        ):
            value = getattr(paper, field)
            if value == NOT_REPORTED:
                continue
            section_sentences = _section_sentence_set(value)
            for sentence, page_number in _sentences(stored.pages):
                if sentence.casefold() not in section_sentences:
                    continue
                key = (paper_id, sentence.casefold())
                if key not in seen:
                    seen.add(key)
                    gaps.append(
                        ResearchGap(
                            statement=sentence,
                            basis_type=basis_type,
                            evidence=_gap_evidence(sentence, page_number, stored),
                        )
                    )

        # Only explicit wording is eligible outside documented sections. This
        # avoids turning arbitrary result text into an invented research gap.
        for sentence, page_number in _sentences(stored.pages):
            lower = sentence.casefold()
            explicit_gap = (
                "unanswered" in lower
                or "open question" in lower
                or "open problem" in lower
                or "remain" in lower
                or "remains" in lower
                or "unknown question" in lower
                or "not known" in lower
            )
            if not explicit_gap:
                continue
            key = (paper_id, sentence.casefold())
            if key in seen:
                continue
            seen.add(key)
            gaps.append(
                ResearchGap(
                    statement=sentence,
                    basis_type="open_question",
                    evidence=_gap_evidence(sentence, page_number, stored),
                )
            )

    return GapsResponse(
        paper_ids=[stored.upload.paper_id or "" for stored in papers],
        gaps=gaps,
        note=None if gaps else "No documented limitations, future directions, or explicit open questions were found.",
    )


def _markdown_evidence(references: Sequence[EvidenceReference]) -> str:
    if not references:
        return "Evidence: Not available in extracted text."
    return " ".join(
        f'Exact evidence: "{reference.supporting_text}" '
        f'({reference.paper_title + ", " if reference.paper_title else ""}'
        f'page {", ".join(map(str, reference.source_pages))}).'
        for reference in references
    )


def generate_report(papers: Sequence[StoredPaper]) -> ReportResponse:
    paper_ids = [stored.upload.paper_id or "" for stored in papers]
    lines = ["# Research report", "", "## Selected papers", ""]
    for stored in papers:
        paper = stored.upload.paper
        lines.extend(
            [
                f"### {paper.title} ({stored.upload.paper_id})",
                f"- Authors: {paper.authors}",
                f"- Publication year: {paper.publication_year}",
                f"- Abstract: {paper.abstract}",
            ]
        )
        summary_fields = (
            ("Research problem", "research_problem"),
            ("Objectives", "objectives"),
            ("Methodology", "methodology"),
            ("Datasets/sample sizes", "datasets_sample_sizes"),
            ("Evaluation metrics", "evaluation_metrics"),
            ("Reported results", "reported_results"),
            ("Limitations", "limitations"),
            ("Future research directions", "future_research_directions"),
        )
        for label, field in summary_fields:
            lines.append(f"- {label}: {getattr(paper, field)}")
            lines.append(f"  - {_markdown_evidence(stored.field_evidence.get(field, ())) }")
        lines.extend(
            [
                f"- {_markdown_evidence(stored.field_evidence.get('title', ())) }",
                f"- {_markdown_evidence(stored.field_evidence.get('authors', ())) }",
                f"- {_markdown_evidence(stored.field_evidence.get('publication_year', ())) }",
                "",
            ]
        )

    if len(papers) > 1:
        lines.extend(["## Comparison", "", "| Dimension | " + " | ".join(stored.upload.paper.title for stored in papers) + " |", "| --- | " + " | ".join("---" for _ in papers) + " |"])
        for name, fields in _COMPARISON_FIELDS:
            values: list[str] = []
            for stored in papers:
                present = [getattr(stored.upload.paper, field) for field in fields]
                value = " / ".join(item for item in present if item != NOT_REPORTED) or NOT_REPORTED
                values.append(value.replace("|", "\\|"))
            lines.append(f"| {name} | " + " | ".join(values) + " |")
        lines.append("")

    gaps = derive_gaps(papers)
    lines.extend(["## Candidate gaps", ""])
    if gaps.gaps:
        for gap in gaps.gaps:
            lines.append(f"- **{gap.basis_type}:** {gap.statement} {_markdown_evidence(gap.evidence)}")
    else:
        lines.append(f"- {gaps.note}")
    lines.extend(["", "## Known limitations", ""])
    for stored in papers:
        limitation = stored.upload.paper.limitations
        lines.append(
            f"- **{stored.upload.paper.title}:** {limitation} {_markdown_evidence(stored.field_evidence.get('limitations', ())) }"
        )
    lines.extend(["", "Generated from exact locally extracted text; no model-generated conclusions were added.", ""])
    filename = "research-report-" + "-".join(paper_id.replace("/", "-") for paper_id in paper_ids) + ".md"
    return ReportResponse(filename=filename, content_type="text/markdown", content="\n".join(lines))
