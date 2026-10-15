export interface PageExtractionStatus {
  page_number: number
  status: string
  text_length: number
  image_only: boolean
}

export interface ImportantClaim {
  supporting_text: string
  source_pages: number[]
}

export interface PaperExtraction {
  title: string
  authors: string
  publication_year: string
  abstract: string
  research_problem: string
  objectives: string
  methodology: string
  datasets_sample_sizes: string
  evaluation_metrics: string
  reported_results: string
  limitations: string
  future_research_directions: string
  important_claims: ImportantClaim[]
}

/** The validated response returned by POST /api/papers/upload. */
export interface PaperUploadResponse {
  paper_id?: string
  filename: string
  mime_type: string
  byte_size: number
  page_count: number
  extracted_text_length: number
  pages: PageExtractionStatus[]
  image_only_pages: number[]
  ocr_unavailable: boolean
  warnings: string[]
  paper: PaperExtraction
}

export interface PaperRecord extends PaperUploadResponse {
  paper_id: string
}

export interface EvidenceReference {
  paper_id: string
  paper_title: string
  page_number: number
  snippet: string
}

export interface ComparisonValue {
  paper_id: string
  paper_title: string
  value: string
  evidence: EvidenceReference[]
}

export interface ComparisonField {
  field: string
  label: string
  values: ComparisonValue[]
}

export interface ComparisonResponse {
  papers: Array<{ paper_id: string; title: string }>
  fields: ComparisonField[]
}

export interface SearchEvidenceResponse {
  query: string
  results: EvidenceReference[]
}

export interface GapCandidate {
  gap: string
  basis: string
  evidence: EvidenceReference[]
}

export interface GapsResponse {
  gaps: GapCandidate[]
}

export interface ReportResponse {
  markdown: string
  filename: string
}

export type UploadResultState = 'success' | 'empty' | 'image_only'

export class UploadApiError extends Error {
  readonly kind: 'unavailable' | 'validation' | 'server' | 'malformed'
  readonly status?: number

  constructor(message: string, kind: UploadApiError['kind'], status?: number) {
    super(message)
    this.name = 'UploadApiError'
    this.kind = kind
    this.status = status
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
export const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/papers/upload`
export const PAPERS_ENDPOINT = `${API_BASE_URL}/api/papers`
export const RESEARCH_ENDPOINT = `${API_BASE_URL}/api/research`
export const COMPARE_ENDPOINT = `${RESEARCH_ENDPOINT}/compare`
export const SEARCH_ENDPOINT = `${RESEARCH_ENDPOINT}/search`
export const GAPS_ENDPOINT = `${RESEARCH_ENDPOINT}/gaps`
export const REPORT_ENDPOINT = `${RESEARCH_ENDPOINT}/report`

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function parsePage(value: unknown): PageExtractionStatus | undefined {
  if (!isRecord(value) || !isNonNegativeInteger(value.page_number) || value.page_number < 1 || !isNonEmptyString(value.status) || !isNonNegativeInteger(value.text_length) || typeof value.image_only !== 'boolean') {
    return undefined
  }
  return {
    page_number: value.page_number,
    status: value.status,
    text_length: value.text_length,
    image_only: value.image_only,
  }
}

function parseClaim(value: unknown): ImportantClaim | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.supporting_text) || !Array.isArray(value.source_pages) || !value.source_pages.every((page) => isNonNegativeInteger(page) && page > 0)) {
    return undefined
  }
  return { supporting_text: value.supporting_text, source_pages: value.source_pages }
}

function parsePaper(value: unknown): PaperExtraction | undefined {
  if (!isRecord(value)) return undefined
  const scalarFields = [
    'title', 'authors', 'publication_year', 'abstract', 'research_problem', 'objectives',
    'methodology', 'datasets_sample_sizes', 'evaluation_metrics', 'reported_results',
    'limitations', 'future_research_directions',
  ] as const
  if (!scalarFields.every((field) => typeof value[field] === 'string') || !Array.isArray(value.important_claims)) return undefined
  const importantClaims = value.important_claims.flatMap((claim) => {
    const parsed = parseClaim(claim)
    return parsed ? [parsed] : []
  })
  if (importantClaims.length !== value.important_claims.length) return undefined
  return {
    title: value.title as string,
    authors: value.authors as string,
    publication_year: value.publication_year as string,
    abstract: value.abstract as string,
    research_problem: value.research_problem as string,
    objectives: value.objectives as string,
    methodology: value.methodology as string,
    datasets_sample_sizes: value.datasets_sample_sizes as string,
    evaluation_metrics: value.evaluation_metrics as string,
    reported_results: value.reported_results as string,
    limitations: value.limitations as string,
    future_research_directions: value.future_research_directions as string,
    important_claims: importantClaims,
  }
}

export function parsePaperUploadResponse(payload: unknown): PaperUploadResponse {
  if (!isRecord(payload) || !isNonEmptyString(payload.filename) || !isNonEmptyString(payload.mime_type) || !isNonNegativeInteger(payload.byte_size) || !isNonNegativeInteger(payload.page_count) || payload.page_count < 1 || !isNonNegativeInteger(payload.extracted_text_length) || !Array.isArray(payload.pages) || payload.pages.length !== payload.page_count || !Array.isArray(payload.image_only_pages) || !payload.image_only_pages.every((page) => isNonNegativeInteger(page) && page > 0) || typeof payload.ocr_unavailable !== 'boolean' || !Array.isArray(payload.warnings) || !payload.warnings.every((warning) => typeof warning === 'string')) {
    throw new UploadApiError('The backend returned an invalid extraction result. Please try again.', 'malformed')
  }

  const pages = payload.pages.flatMap((page) => {
    const parsed = parsePage(page)
    return parsed ? [parsed] : []
  })
  const paper = parsePaper(payload.paper)
  if (pages.length !== payload.pages.length || !paper) {
    throw new UploadApiError('The backend returned an invalid extraction result. Please try again.', 'malformed')
  }

  return {
    ...(isNonEmptyString(payload.paper_id) ? { paper_id: payload.paper_id } : {}),
    filename: payload.filename,
    mime_type: payload.mime_type,
    byte_size: payload.byte_size,
    page_count: payload.page_count,
    extracted_text_length: payload.extracted_text_length,
    pages,
    image_only_pages: payload.image_only_pages,
    ocr_unavailable: payload.ocr_unavailable,
    warnings: payload.warnings,
    paper,
  }
}

const MALFORMED_LIBRARY = 'The backend returned an invalid paper library result. Please refresh and try again.'
const MALFORMED_ANALYSIS = 'The backend returned an invalid analysis result. Please try again.'

function invalid(message: string): never {
  throw new UploadApiError(message, 'malformed')
}

function parseEvidence(value: unknown, fallbackPaperId = '', fallbackTitle = '', fallbackPage?: number): EvidenceReference | undefined {
  if (!isRecord(value)) return undefined
  const paperId = value.paper_id ?? value.paperId ?? fallbackPaperId
  const page = value.page_number ?? value.page ?? value.source_page ?? fallbackPage
  const snippet = value.snippet ?? value.supporting_text ?? value.text ?? value.evidence
  const title = value.paper_title ?? value.title ?? fallbackTitle
  if (!isNonEmptyString(paperId) || !isNonEmptyString(title) || !isNonNegativeInteger(page) || page < 1 || !isNonEmptyString(snippet)) return undefined
  return { paper_id: paperId, paper_title: title, page_number: page, snippet }
}

function parsePaperRecord(value: unknown): PaperRecord | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.paper_id ?? value.id)) return undefined
  const upload = parsePaperUploadResponse(value)
  return { ...upload, paper_id: (value.paper_id ?? value.id) as string }
}

function parsePaperListPayload(payload: unknown): PaperRecord[] {
  const items = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.papers) ? payload.papers : undefined
  if (!items) invalid(MALFORMED_LIBRARY)
  const parsed = items.flatMap((item) => {
    try {
      const paper = parsePaperRecord(item)
      return paper ? [paper] : []
    } catch {
      return []
    }
  })
  if (parsed.length !== items.length) invalid(MALFORMED_LIBRARY)
  return parsed
}

function parseDetailPayload(payload: unknown): PaperRecord {
  const item = isRecord(payload) && isRecord(payload.paper) && isNonEmptyString(payload.paper_id ?? payload.id)
    ? payload
    : isRecord(payload) && isRecord(payload.paper) && isNonEmptyString(payload.paper.paper_id ?? payload.paper.id)
      ? { ...payload.paper, ...payload }
      : payload
  const parsed = parsePaperRecord(item)
  if (!parsed) invalid(MALFORMED_LIBRARY)
  return parsed
}

function parseEvidenceList(value: unknown, fallbackPaperId = '', fallbackTitle = ''): EvidenceReference[] {
  if (!Array.isArray(value)) invalid(MALFORMED_ANALYSIS)
  const parsed: EvidenceReference[] = []
  let validItems = 0
  value.forEach((item) => {
    if (!isRecord(item)) return
    const pages = Array.isArray(item.source_pages) ? item.source_pages : [undefined]
    const itemEvidence = pages.flatMap((page) => {
      if (page !== undefined && (!isNonNegativeInteger(page) || page < 1)) return []
      const evidence = parseEvidence(item, fallbackPaperId, fallbackTitle, page)
      return evidence ? [evidence] : []
    })
    if (itemEvidence.length) validItems += 1
    parsed.push(...itemEvidence)
  })
  if (validItems !== value.length) invalid(MALFORMED_ANALYSIS)
  return parsed
}

function parseComparison(payload: unknown): ComparisonResponse {
  if (!isRecord(payload) || !Array.isArray(payload.papers)) invalid(MALFORMED_ANALYSIS)
  const papers = payload.papers.flatMap((paper) => {
    if (!isRecord(paper) || !isNonEmptyString(paper.paper_id ?? paper.id)) return []
    const nestedPaper = isRecord(paper.paper) ? paper.paper : undefined
    const title = paper.title ?? nestedPaper?.title ?? paper.filename
    if (!isNonEmptyString(title)) return []
    return [{ paper_id: (paper.paper_id ?? paper.id) as string, title }]
  })
  if (papers.length !== payload.papers.length) invalid(MALFORMED_ANALYSIS)
  const rawFields = Array.isArray(payload.fields) ? payload.fields : Array.isArray(payload.comparisons) ? payload.comparisons : Array.isArray(payload.dimensions) ? payload.dimensions : undefined
  if (!rawFields) invalid(MALFORMED_ANALYSIS)
  const fields = rawFields.flatMap((rawField) => {
    if (!isRecord(rawField) || !isNonEmptyString(rawField.field ?? rawField.key ?? rawField.label ?? rawField.name)) return []
    const rawValues = Array.isArray(rawField.values) ? rawField.values : Array.isArray(rawField.papers) ? rawField.papers : Array.isArray(rawField.entries) ? rawField.entries : undefined
    if (!rawValues) return []
    const values = rawValues.flatMap((rawValue) => {
      if (!isRecord(rawValue) || !isNonEmptyString(rawValue.paper_id ?? rawValue.id)) return []
      const id = (rawValue.paper_id ?? rawValue.id) as string
      const paper = papers.find((candidate) => candidate.paper_id === id)
      const value = rawValue.value ?? rawValue.text ?? rawValue.content
      if (!isNonEmptyString(value) || !paper) return []
      const evidence = rawValue.evidence === undefined ? [] : parseEvidenceList(rawValue.evidence, id, paper.title)
      return [{ paper_id: id, paper_title: paper.title, value, evidence }]
    })
    if (values.length !== rawValues.length) return []
    return [{ field: (rawField.field ?? rawField.key ?? rawField.label ?? rawField.name) as string, label: (rawField.label ?? rawField.field ?? rawField.key ?? rawField.name) as string, values }]
  })
  if (fields.length !== rawFields.length) invalid(MALFORMED_ANALYSIS)
  return { papers, fields }
}

function parseSearch(payload: unknown, query: string): SearchEvidenceResponse {
  const rawResults = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.results) ? payload.results : isRecord(payload) && Array.isArray(payload.hits) ? payload.hits : undefined
  if (!rawResults) invalid(MALFORMED_ANALYSIS)
  const results = rawResults.flatMap((result) => {
    if (!isRecord(result)) return []
    const paperId = isNonEmptyString(result.paper_id) ? result.paper_id : ''
    const title = isNonEmptyString(result.paper_title) ? result.paper_title : isNonEmptyString(result.title) ? result.title : ''
    const evidence = parseEvidenceList([result], paperId, title)
    return evidence
  })
  if (results.length === 0 && rawResults.length > 0) invalid(MALFORMED_ANALYSIS)
  return { query, results }
}

function parseGaps(payload: unknown): GapsResponse {
  const rawGaps = Array.isArray(payload) ? payload : isRecord(payload) && Array.isArray(payload.gaps) ? payload.gaps : undefined
  if (!rawGaps) invalid(MALFORMED_ANALYSIS)
  const gaps = rawGaps.flatMap((rawGap) => {
    if (!isRecord(rawGap) || !isNonEmptyString(rawGap.gap ?? rawGap.question ?? rawGap.description ?? rawGap.statement) || !isNonEmptyString(rawGap.basis ?? rawGap.basis_label ?? rawGap.reason ?? rawGap.basis_type)) return []
    const evidence = rawGap.evidence === undefined ? [] : parseEvidenceList(rawGap.evidence, 'selected', 'Selected papers')
    return [{ gap: (rawGap.gap ?? rawGap.question ?? rawGap.description ?? rawGap.statement) as string, basis: (rawGap.basis ?? rawGap.basis_label ?? rawGap.reason ?? rawGap.basis_type) as string, evidence }]
  })
  if (gaps.length !== rawGaps.length) invalid(MALFORMED_ANALYSIS)
  return { gaps }
}

export function getUploadResultState(response: PaperUploadResponse): UploadResultState {
  if (response.extracted_text_length === 0 && (response.ocr_unavailable || response.image_only_pages.length > 0)) return 'image_only'
  if (response.extracted_text_length === 0) return 'empty'
  return 'success'
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function requestJson<T>(url: string, init: RequestInit, parse: (payload: unknown) => T, fetchImpl: typeof fetch): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch {
    throw new UploadApiError('The ResearchMind backend is unavailable. Check that FastAPI is running and try again.', 'unavailable')
  }
  const payload = await readJson(response)
  if (!response.ok) throw new UploadApiError('The ResearchMind backend could not complete that request. Please try again.', response.status >= 400 && response.status < 500 ? 'validation' : 'server', response.status)
  return parse(payload)
}

export async function listPapers(fetchImpl: typeof fetch = fetch): Promise<PaperRecord[]> {
  return requestJson(PAPERS_ENDPOINT, { method: 'GET' }, parsePaperListPayload, fetchImpl)
}

export async function getPaper(paperId: string, fetchImpl: typeof fetch = fetch): Promise<PaperRecord> {
  return requestJson(`${PAPERS_ENDPOINT}/${encodeURIComponent(paperId)}`, { method: 'GET' }, parseDetailPayload, fetchImpl)
}

export async function removePaper(paperId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let response: Response
  try { response = await fetchImpl(`${PAPERS_ENDPOINT}/${encodeURIComponent(paperId)}`, { method: 'DELETE' }) } catch { throw new UploadApiError('The ResearchMind backend is unavailable. Check that FastAPI is running and try again.', 'unavailable') }
  if (!response.ok) throw new UploadApiError('The paper could not be removed. Please try again.', response.status >= 400 && response.status < 500 ? 'validation' : 'server', response.status)
}

export async function comparePapers(paperIds: string[], fetchImpl: typeof fetch = fetch): Promise<ComparisonResponse> {
  return requestJson(COMPARE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paper_ids: paperIds }) }, parseComparison, fetchImpl)
}

export async function searchPapers(query: string, paperIds?: string[], fetchImpl: typeof fetch = fetch): Promise<SearchEvidenceResponse> {
  const params = new URLSearchParams({ q: query })
  if (paperIds?.length) params.set('paper_ids', paperIds.join(','))
  return requestJson(`${SEARCH_ENDPOINT}?${params.toString()}`, { method: 'GET' }, (payload) => parseSearch(payload, query), fetchImpl)
}

export const searchEvidence = searchPapers

export async function getPaperGaps(paperIds: string[], fetchImpl: typeof fetch = fetch): Promise<GapsResponse> {
  return requestJson(GAPS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paper_ids: paperIds }) }, parseGaps, fetchImpl)
}

export const findGaps = getPaperGaps

export async function generateReport(paperIds: string[], fetchImpl: typeof fetch = fetch): Promise<ReportResponse> {
  let response: Response
  try { response = await fetchImpl(REPORT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paper_ids: paperIds }) }) } catch { throw new UploadApiError('The ResearchMind backend is unavailable. Check that FastAPI is running and try again.', 'unavailable') }
  if (!response.ok) throw new UploadApiError('The report could not be generated. Please try again.', response.status >= 400 && response.status < 500 ? 'validation' : 'server', response.status)
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = await readJson(response)
    if (!isRecord(payload) || !isNonEmptyString(payload.markdown ?? payload.content)) invalid(MALFORMED_ANALYSIS)
    return { markdown: (payload.markdown ?? payload.content) as string, filename: isNonEmptyString(payload.filename) ? payload.filename : 'researchmind-report.md' }
  }
  const markdown = await response.text()
  if (!isNonEmptyString(markdown)) invalid(MALFORMED_ANALYSIS)
  return { markdown, filename: 'researchmind-report.md' }
}

export const createReport = generateReport

function backendErrorMessage(status: number): string {
  if (status === 400 || status === 415 || status === 413 || status === 422) {
    return 'The backend could not validate this PDF. Check the file and try again.'
  }
  return 'The backend could not process this PDF right now. Please try again.'
}

export async function uploadPaper(file: File, fetchImpl: typeof fetch = fetch): Promise<PaperUploadResponse> {
  const formData = new FormData()
  formData.append('file', file, file.name)

  let response: Response
  try {
    response = await fetchImpl(UPLOAD_ENDPOINT, { method: 'POST', body: formData })
  } catch {
    throw new UploadApiError('The ResearchMind backend is unavailable. Check that FastAPI is running and try again.', 'unavailable')
  }

  const payload = await readJson(response)
  if (!response.ok) {
    throw new UploadApiError(backendErrorMessage(response.status), response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422 ? 'validation' : 'server', response.status)
  }
  return parsePaperUploadResponse(payload)
}
