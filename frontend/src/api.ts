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
