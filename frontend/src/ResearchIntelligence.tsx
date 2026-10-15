import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  comparePapers, generateReport, getPaper, getPaperGaps, removePaper, searchPapers,
  type ComparisonResponse, type EvidenceReference, type GapCandidate, type GapsResponse, type PaperRecord,
  type SearchEvidenceResponse, UploadApiError,
} from './api'

type Props = { library: PaperRecord[]; setLibrary: Dispatch<SetStateAction<PaperRecord[]>>; loadError: string }

function Evidence({ references }: { references: EvidenceReference[] }) {
  if (!references.length) return <span className="evidence-muted">No page reference reported</span>
  return <div className="evidence-list">{references.map((reference, index) => <details className="evidence-item" key={`${reference.paper_id}-${reference.page_number}-${index}`}><summary><span className="evidence-badge">{reference.paper_title} · p. {reference.page_number}</span></summary><p>{reference.snippet}</p></details>)}</div>
}

function PaperLibrary({ library, selectedIds, onToggle, onInspect, onRemove }: { library: PaperRecord[]; selectedIds: Set<string>; onToggle: (id: string) => void; onInspect: (paper: PaperRecord) => void; onRemove: (paper: PaperRecord) => void }) {
  if (!library.length) return <div className="library-empty"><div className="empty-orbit" aria-hidden="true"><span /></div><h3>Your library is quiet.</h3><p>Upload a PDF to begin building a source-grounded research constellation.</p></div>
  return <div className="library-list">{library.map((paper, index) => <article className="library-card" key={paper.paper_id}><label className="library-select"><input type="checkbox" checked={selectedIds.has(paper.paper_id)} onChange={() => onToggle(paper.paper_id)} aria-label={`Select ${paper.paper.title || paper.filename}`} /><span className="checkbox-mark" /></label><div className={`paper-cover ${['coral', 'blue', 'gold'][index % 3]}`}><span>{String(index + 1).padStart(2, '0')}</span><span className="cover-file"><span /><span /></span></div><div className="paper-copy"><h3>{paper.paper.title !== 'Not reported' ? paper.paper.title : paper.filename}</h3><p>{paper.paper.authors !== 'Not reported' ? paper.paper.authors : 'Authors not reported'}{paper.paper.publication_year !== 'Not reported' ? ` · ${paper.paper.publication_year}` : ''}</p><span>{paper.filename} · {paper.page_count} pages · {paper.extracted_text_length.toLocaleString()} chars</span></div><div className="library-actions"><button className="library-action" type="button" onClick={() => onInspect(paper)}>Inspect</button><button className="library-remove" type="button" onClick={() => onRemove(paper)}>Remove</button></div></article>)}</div>
}

function ComparisonPanel({ result }: { result: ComparisonResponse }) {
  return <section className="intelligence-result" aria-labelledby="comparison-result-title"><div className="result-heading"><div><p className="section-kicker">SIDE-BY-SIDE EVIDENCE</p><h3 id="comparison-result-title">What the papers say.</h3></div><span className="result-badge">{result.papers.length} papers</span></div><div className="comparison-table" role="table"><div className="comparison-row comparison-header" role="row"><div role="columnheader">Dimension</div>{result.papers.map((paper) => <div role="columnheader" key={paper.paper_id}>{paper.title}</div>)}</div>{result.fields.map((field) => <div className="comparison-row" role="row" key={field.field}><div className="comparison-label" role="rowheader">{field.label}</div>{result.papers.map((paper) => { const value = field.values.find((candidate) => candidate.paper_id === paper.paper_id); return <div className="comparison-cell" role="cell" key={paper.paper_id}><p>{value?.value ?? 'Not reported'}</p><Evidence references={value?.evidence ?? []} /></div> })}</div>)}</div></section>
}

function SearchResults({ result }: { result: SearchEvidenceResponse }) {
  return <section className="intelligence-result" aria-labelledby="search-result-title"><div className="result-heading"><div><p className="section-kicker">EXACT PAGE EVIDENCE</p><h3 id="search-result-title">Matches for “{result.query}”.</h3></div><span className="result-badge">{result.results.length} hits</span></div>{result.results.length ? <div className="search-results">{result.results.map((item, index) => <article className="search-result" key={`${item.paper_id}-${item.page_number}-${index}`}><p>{item.snippet}</p><span className="evidence-badge">{item.paper_title} · p. {item.page_number}</span></article>)}</div> : <p className="result-note">No supporting passages matched that query in the selected scope.</p>}</section>
}

function GapResults({ result }: { result: GapsResponse }) {
  return <section className="intelligence-result" aria-labelledby="gap-result-title"><div className="result-heading"><div><p className="section-kicker">DETERMINISTIC GAP EXPLORER</p><h3 id="gap-result-title">Questions worth holding.</h3></div><span className="result-badge">{result.gaps.length} candidates</span></div>{result.gaps.length ? <div className="gap-list">{result.gaps.map((gap, index) => <article className="gap-card" key={`${gap.gap}-${index}`}><h4>{gap.gap}</h4><span className="basis-label">Basis · {gap.basis}</span><Evidence references={gap.evidence} /></article>)}</div> : <p className="result-note">No qualifying limitations or open questions were found in the selected papers.</p>}</section>
}

export default function ResearchIntelligence({ library, setLibrary, loadError }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [inspected, setInspected] = useState<PaperRecord | null>(null)
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null)
  const [searchResult, setSearchResult] = useState<SearchEvidenceResponse | null>(null)
  const [gapResult, setGapResult] = useState<GapsResponse | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'selected' | 'all'>('selected')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const ids = [...selectedIds]
  const showError = (cause: unknown, fallback: string) => setError(cause instanceof UploadApiError ? cause.message : fallback)
  const toggle = (id: string) => setSelectedIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })

  const inspect = async (paper: PaperRecord) => {
    setBusy(`inspect-${paper.paper_id}`); setError('')
    try { const detail = await getPaper(paper.paper_id); setInspected(detail); setLibrary((current) => current.map((item) => item.paper_id === detail.paper_id ? detail : item)) } catch (cause) { setInspected(paper); showError(cause, 'The paper details could not be loaded. Showing the library copy.') } finally { setBusy('') }
  }

  const remove = async (paper: PaperRecord) => {
    if (!window.confirm(`Remove “${paper.paper.title !== 'Not reported' ? paper.paper.title : paper.filename}” from the research library?`)) return
    setBusy(`remove-${paper.paper_id}`); setError('')
    try { await removePaper(paper.paper_id); setLibrary((current) => current.filter((item) => item.paper_id !== paper.paper_id)); setSelectedIds((current) => { const next = new Set(current); next.delete(paper.paper_id); return next }); if (inspected?.paper_id === paper.paper_id) setInspected(null) } catch (cause) { showError(cause, 'The paper could not be removed. Please try again.') } finally { setBusy('') }
  }

  const compare = async () => {
    if (ids.length < 2) return
    setBusy('compare'); setError(''); setComparison(null)
    try { setComparison(await comparePapers(ids)) } catch (cause) { showError(cause, 'The comparison could not be loaded. Please try again.') } finally { setBusy('') }
  }

  const search = async () => {
    const trimmed = query.trim()
    if (!trimmed) { setSearchResult(null); setError('Enter a phrase to search the extracted evidence.'); return }
    const searchIds = scope === 'selected' ? ids : undefined
    if (scope === 'selected' && !ids.length) { setSearchResult(null); setError('Select at least one paper or search the full library.'); return }
    if (!library.length) { setSearchResult(null); setError('Upload a paper before searching the library.'); return }
    setBusy('search'); setError('')
    try { setSearchResult(await searchPapers(trimmed, searchIds ?? [])) } catch (cause) { showError(cause, 'Evidence search is unavailable. Please try again.') } finally { setBusy('') }
  }

  const gaps = async () => {
    if (!ids.length) { setError('Select at least one paper to explore gaps.'); return }
    setBusy('gaps'); setError(''); setGapResult(null)
    try { setGapResult(await getPaperGaps(ids)) } catch (cause) { showError(cause, 'The gap explorer is unavailable. Please try again.') } finally { setBusy('') }
  }

  const report = async () => {
    if (!ids.length) { setError('Select at least one paper before generating a report.'); return }
    setBusy('report'); setError('')
    try { const result = await generateReport(ids); const url = URL.createObjectURL(new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = result.filename.endsWith('.md') ? result.filename : `${result.filename}.md`; link.click(); URL.revokeObjectURL(url) } catch (cause) { showError(cause, 'The report could not be generated. Please try again.') } finally { setBusy('') }
  }

  return <section className="research-intelligence" id="library" aria-labelledby="library-title"><div className="panel-heading"><div><p className="section-kicker">RESEARCH LIBRARY</p><h2 id="library-title">Sources in <em>orbit.</em></h2></div><span className="library-count">{library.length} {library.length === 1 ? 'paper' : 'papers'}</span></div><p className="library-intro">Select sources to compare, search, question, or carry into a portable evidence report.</p><PaperLibrary library={library} selectedIds={selectedIds} onToggle={toggle} onInspect={inspect} onRemove={remove} />{loadError && <p className="result-note has-error">{loadError}</p>}{error && <p className="intelligence-error" role="alert">{error}</p>}{inspected && <section className="intelligence-result inspected-paper" aria-labelledby="inspected-title"><div className="result-heading"><div><p className="section-kicker">PAPER DETAIL</p><h3 id="inspected-title">{inspected.paper.title !== 'Not reported' ? inspected.paper.title : inspected.filename}</h3></div><button className="quiet-button" type="button" onClick={() => setInspected(null)}>Close</button></div><div className="paper-metadata"><div><dt>Authors</dt><dd>{inspected.paper.authors}</dd></div><div><dt>Year</dt><dd>{inspected.paper.publication_year}</dd></div><div><dt>Pages</dt><dd>{inspected.page_count}</dd></div><div><dt>Text</dt><dd>{inspected.extracted_text_length.toLocaleString()} chars</dd></div></div><div className="paper-fields">{[['Objectives', inspected.paper.objectives], ['Methodology', inspected.paper.methodology], ['Limitations', inspected.paper.limitations]].map(([label, value]) => <div className="paper-field" key={label}><p className="paper-field-label">{label}</p><p>{value}</p></div>)}</div></section>}
    <div className="tool-grid"><section className="tool-card" aria-labelledby="compare-title"><p className="section-kicker">COMPARE SOURCES</p><h3 id="compare-title">Read across the <em>grain.</em></h3><p>Line up objectives, methods, datasets, metrics, results, and limitations without adding interpretation.</p><button className="tool-button" type="button" disabled={ids.length < 2 || busy === 'compare'} onClick={() => void compare}>{busy === 'compare' ? 'Comparing…' : `Compare ${ids.length || 'selected'} papers`}</button></section><section className="tool-card" aria-labelledby="gap-title"><p className="section-kicker">OPEN QUESTIONS</p><h3 id="gap-title">Find the <em>edges.</em></h3><p>Surface only limitations and questions supported by the selected paper evidence.</p><button className="tool-button" type="button" disabled={!ids.length || busy === 'gaps'} onClick={() => void gaps}>{busy === 'gaps' ? 'Exploring…' : 'Explore gaps'}</button></section></div>
    <section className="tool-card search-card" aria-labelledby="search-title"><div className="search-heading"><div><p className="section-kicker">CROSS-PAPER SEARCH</p><h3 id="search-title">Follow a phrase through the <em>archive.</em></h3></div><select value={scope} onChange={(event) => setScope(event.target.value as 'selected' | 'all')} aria-label="Search scope"><option value="selected">Selected papers</option><option value="all">All library papers</option></select></div><div className="search-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search() }} placeholder="e.g. participatory design" aria-label="Search extracted evidence" /><button className="tool-button" type="button" disabled={busy === 'search'} onClick={() => void search}>{busy === 'search' ? 'Searching…' : 'Search evidence'}</button></div></section><section className="report-strip"><div><p className="section-kicker">TAKE YOUR EVIDENCE WITH YOU</p><strong>Download a source-grounded Markdown report.</strong></div><button className="report-button" type="button" disabled={!ids.length || busy === 'report'} onClick={() => void report}>{busy === 'report' ? 'Preparing…' : 'Download report'} <span aria-hidden="true">↓</span></button></section>{comparison && <ComparisonPanel result={comparison} />}{searchResult && <SearchResults result={searchResult} />}{gapResult && <GapResults result={gapResult} />}</section>
}
