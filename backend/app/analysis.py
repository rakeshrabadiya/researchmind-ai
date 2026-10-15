"""Deterministic evidence extraction and the future provider boundary."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Protocol

from .extraction import ExtractedDocument, ExtractedPage
from .models import ImportantClaim, PaperExtraction

NOT_REPORTED = "Not reported"
UNABLE_TO_VERIFY = "Unable to verify"
_MAX_EVIDENCE_CHARS = 20_000


class ProviderAdapter(Protocol):
    """Interface for a future approved model provider.

    No provider is configured in this milestone. Implementations must return
    the validated ``PaperExtraction`` contract and must not be assumed to be
    OpenAI-compatible.
    """

    def analyze(self, pages: Sequence[ExtractedPage]) -> PaperExtraction:
        """Analyze extracted pages using an explicitly approved provider."""


class UnconfiguredProviderAdapter:
    """Explicit blocked adapter: this backend makes no model calls."""

    def analyze(self, pages: Sequence[ExtractedPage]) -> PaperExtraction:
        raise RuntimeError("AI analysis is not configured for this milestone")


_SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "abstract": ("abstract",),
    "research_problem": ("research problem", "problem statement", "problem definition"),
    "objectives": ("objectives", "research objectives", "aims", "goals"),
    "methodology": ("methodology", "methods", "method", "approach", "experimental setup"),
    "datasets_sample_sizes": ("dataset", "datasets", "data", "participants", "sample"),
    "evaluation_metrics": ("evaluation", "evaluation metrics", "metrics", "measures"),
    "reported_results": ("results", "findings", "experimental results"),
    "limitations": ("limitations", "threats to validity", "constraints"),
    "future_research_directions": (
        "future work",
        "future research",
        "research directions",
        "conclusion and future work",
    ),
}
_HEADING_RE = re.compile(r"^\s*(?:\d+(?:\.\d+)*[.)]?\s*)?([A-Za-z][A-Za-z &/-]{2,80})\s*[:.]?\s*$")
_YEAR_RE = re.compile(r"\b(?:19|20)\d{2}\b")
_SENTENCE_RE = re.compile(r"[^.!?\n]+(?:[.!?](?=\s|$)|$)")
_CLAIM_SIGNALS = ("we found", "results", "significant", "conclude", "concluded", "we demonstrate", "outperformed")


def _line_heading(line: str) -> str | None:
    match = _HEADING_RE.match(line.strip())
    if not match:
        return None
    candidate = re.sub(r"\s+", " ", match.group(1)).strip().lower()
    for aliases in _SECTION_ALIASES.values():
        if candidate in aliases:
            return candidate
    return None


def _section_text(pages: Sequence[ExtractedPage], field: str) -> str | None:
    aliases = set(_SECTION_ALIASES[field])
    collecting = False
    collected: list[str] = []
    for page in pages:
        for line in page.text.splitlines():
            heading = _line_heading(line)
            if heading is not None:
                if collecting:
                    value = "\n".join(collected).strip()
                    if value:
                        return value[:_MAX_EVIDENCE_CHARS]
                collecting = heading in aliases
                collected = []
                continue
            if collecting:
                collected.append(line)
    if collecting:
        value = "\n".join(collected).strip()
        if value:
            return value[:_MAX_EVIDENCE_CHARS]
    return None


def _sentences(pages: Sequence[ExtractedPage]) -> list[tuple[str, int]]:
    result: list[tuple[str, int]] = []
    for page in pages:
        for match in _SENTENCE_RE.finditer(page.text):
            sentence = match.group(0).strip()
            if sentence:
                result.append((sentence, page.page_number))
    return result


def _first_page_title(page: ExtractedPage) -> str:
    for raw_line in page.text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line or len(line) > 300 or _line_heading(line) is not None:
            continue
        if line.lower().startswith(("by ", "authors:", "author:")):
            continue
        return line
    return NOT_REPORTED


def _authors(page: ExtractedPage) -> str:
    for raw_line in page.text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        match = re.match(r"^(?:by\s+|authors?:\s*)(.+)$", line, flags=re.IGNORECASE)
        if match and 2 <= len(match.group(1).split()) <= 20:
            return match.group(1).strip()
    return NOT_REPORTED


def _first_matching_sentence(pages: Sequence[ExtractedPage], signals: tuple[str, ...]) -> str:
    for sentence, _page in _sentences(pages):
        lower = sentence.lower()
        if any(signal in lower for signal in signals):
            return sentence[:_MAX_EVIDENCE_CHARS]
    return NOT_REPORTED


def _claims(pages: Sequence[ExtractedPage]) -> list[ImportantClaim]:
    claims: list[ImportantClaim] = []
    seen: set[str] = set()
    for sentence, page_number in _sentences(pages):
        lower = sentence.lower()
        if not any(signal in lower for signal in _CLAIM_SIGNALS):
            continue
        exact = sentence[:_MAX_EVIDENCE_CHARS]
        if exact in seen:
            continue
        seen.add(exact)
        claims.append(ImportantClaim(supporting_text=exact, source_pages=[page_number]))
        if len(claims) == 10:
            break
    return claims


def analyze_deterministically(document: ExtractedDocument) -> PaperExtraction:
    """Return only text-backed heuristics; AI analysis is not implemented."""

    pages = document.pages
    # Restrict header-like metadata to page one so a year in the references or
    # body is not misrepresented as the publication year.
    year_match = _YEAR_RE.search(pages[0].text) if pages else None
    values: dict[str, str] = {}
    for field in _SECTION_ALIASES:
        values[field] = _section_text(pages, field) or NOT_REPORTED

    if values["research_problem"] == NOT_REPORTED:
        values["research_problem"] = _first_matching_sentence(pages, ("problem", "challenge", "research question"))
    if values["objectives"] == NOT_REPORTED:
        values["objectives"] = _first_matching_sentence(pages, ("objective", "aim", "we seek", "we investigate"))
    if values["datasets_sample_sizes"] == NOT_REPORTED:
        values["datasets_sample_sizes"] = _first_matching_sentence(pages, ("dataset", "sample size", "participants", "n ="))
    if values["evaluation_metrics"] == NOT_REPORTED:
        values["evaluation_metrics"] = _first_matching_sentence(pages, ("accuracy", "precision", "recall", "f1", "auc", "metric"))
    if values["reported_results"] == NOT_REPORTED:
        values["reported_results"] = _first_matching_sentence(pages, ("results", "we found", "significant", "outperformed"))

    return PaperExtraction(
        title=_first_page_title(pages[0]) if pages else NOT_REPORTED,
        authors=_authors(pages[0]) if pages else NOT_REPORTED,
        publication_year=year_match.group(0) if year_match else NOT_REPORTED,
        abstract=values["abstract"],
        research_problem=values["research_problem"],
        objectives=values["objectives"],
        methodology=values["methodology"],
        datasets_sample_sizes=values["datasets_sample_sizes"],
        evaluation_metrics=values["evaluation_metrics"],
        reported_results=values["reported_results"],
        limitations=values["limitations"],
        future_research_directions=values["future_research_directions"],
        important_claims=_claims(pages),
    )
