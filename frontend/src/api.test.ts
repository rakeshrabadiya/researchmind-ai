import { describe, expect, it, vi } from 'vitest'
import { getUploadResultState, parsePaperUploadResponse, UPLOAD_ENDPOINT, uploadPaper, UploadApiError } from './api'

function makeFile() {
  return new File(['pdf bytes'], 'attention-study.pdf', { type: 'application/pdf' })
}

function successfulPayload() {
  return {
    filename: 'attention-study.pdf', mime_type: 'application/pdf', byte_size: 2048, page_count: 2, extracted_text_length: 42,
    pages: [
      { page_number: 1, status: 'text_extracted', text_length: 30, image_only: false },
      { page_number: 2, status: 'text_extracted', text_length: 12, image_only: false },
    ],
    image_only_pages: [], ocr_unavailable: false, warnings: [],
    paper: {
      title: 'Attention study', authors: 'Not reported', publication_year: 'Not reported', abstract: 'Not reported',
      research_problem: 'Not reported', objectives: 'Not reported', methodology: 'Not reported', datasets_sample_sizes: 'Not reported',
      evaluation_metrics: 'Not reported', reported_results: 'Not reported', limitations: 'Not reported', future_research_directions: 'Not reported',
      important_claims: [{ supporting_text: 'Attention is collective.', source_pages: [1] }],
    },
  }
}

describe('uploadPaper', () => {
  it('posts the PDF as multipart FormData and parses the validated response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(successfulPayload()), { status: 200 }))

    const result = await uploadPaper(makeFile(), fetchMock)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(UPLOAD_ENDPOINT)
    const request = fetchMock.mock.calls[0][1]
    expect(request?.method).toBe('POST')
    expect(request?.body).toBeInstanceOf(FormData)
    expect((request?.body as FormData).get('file')).toBeInstanceOf(File)
    expect(result.filename).toBe('attention-study.pdf')
    expect(result.pages[1].text_length).toBe(12)
    expect(result.paper.important_claims[0].source_pages[0]).toBe(1)
  })

  it('turns backend validation errors into a deterministic retryable error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ detail: 'invalid pdf' }), { status: 422 }))

    await expect(uploadPaper(makeFile(), fetchMock)).rejects.toMatchObject({
      name: 'UploadApiError',
      kind: 'validation',
      message: 'The backend could not validate this PDF. Check the file and try again.',
    } satisfies Partial<UploadApiError>)
  })

  it('reports an unavailable backend without attempting a second network path', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(uploadPaper(makeFile(), fetchMock)).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'The ResearchMind backend is unavailable. Check that FastAPI is running and try again.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('paper upload response validation', () => {
  it('rejects empty or malformed backend results', () => {
    expect(() => parsePaperUploadResponse({})).toThrow('The backend returned an invalid extraction result. Please try again.')
    expect(() => parsePaperUploadResponse({ filename: 'paper.pdf', mime_type: 'application/pdf', byte_size: 2, page_count: 1, extracted_text_length: 0, pages: [], image_only_pages: [], ocr_unavailable: false, warnings: [], paper: {} })).toThrow('The backend returned an invalid extraction result. Please try again.')
  })

  it('keeps an accepted empty extraction distinguishable from an image-only extraction', () => {
    const empty = parsePaperUploadResponse({
      ...successfulPayload(), filename: 'empty.pdf', page_count: 1, extracted_text_length: 0,
      pages: [{ page_number: 1, status: 'empty', text_length: 0, image_only: false }],
    })
    const imageOnly = parsePaperUploadResponse({
      ...successfulPayload(), filename: 'scan.pdf', extracted_text_length: 0, ocr_unavailable: true, image_only_pages: [1],
      pages: [{ page_number: 1, status: 'image_only', text_length: 0, image_only: true }], page_count: 1,
    })

    expect(getUploadResultState(empty)).toBe('empty')
    expect(getUploadResultState(imageOnly)).toBe('image_only')
  })
})
