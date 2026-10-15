import { describe, expect, it, vi } from 'vitest'
import { comparePapers, generateReport, getPaper, getPaperGaps, getUploadResultState, listPapers, parsePaperUploadResponse, removePaper, searchPapers, uploadPaper, UPLOAD_ENDPOINT, UploadApiError, PAPERS_ENDPOINT, COMPARE_ENDPOINT, SEARCH_ENDPOINT, GAPS_ENDPOINT, REPORT_ENDPOINT } from './api'

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

function storedPaperPayload(paper_id = 'paper-1') {
  return { ...successfulPayload(), paper_id }
}

function response(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: headers ?? { 'content-type': 'application/json' } })
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

describe('paper library and intelligence endpoints', () => {
  it('lists and removes stored papers with paper ids', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ papers: [storedPaperPayload()] }))
      .mockResolvedValueOnce(response(undefined, 204))

    const papers = await listPapers(fetchMock)
    await removePaper('paper-1', fetchMock)

    expect(papers[0].paper_id).toBe('paper-1')
    expect(fetchMock.mock.calls[0][0]).toBe(PAPERS_ENDPOINT)
    expect(fetchMock.mock.calls[1][0]).toBe(`${PAPERS_ENDPOINT}/paper-1`)
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE')
  })

  it('parses detail, compare values, and page-attributed evidence', async () => {
    const comparePayload = {
      papers: [{ paper_id: 'paper-1', title: 'Attention study' }, { paper_id: 'paper-2', title: 'Second study' }],
      fields: [{ field: 'objectives', label: 'Objectives', values: [
        { paper_id: 'paper-1', value: 'Measure attention.', evidence: [{ paper_id: 'paper-1', paper_title: 'Attention study', page_number: 1, snippet: 'We measure attention.' }] },
        { paper_id: 'paper-2', value: 'Study recall.', evidence: [] },
      ] }],
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(storedPaperPayload()))
      .mockResolvedValueOnce(response(comparePayload))
      .mockResolvedValueOnce(response({ results: [{ paper_id: 'paper-1', paper_title: 'Attention study', page_number: 2, snippet: 'Attention is collective.' }] }))

    const detail = await getPaper('paper-1', fetchMock)
    const comparison = await comparePapers(['paper-1', 'paper-2'], fetchMock)
    const search = await searchPapers('attention', ['paper-1'], fetchMock)

    expect(detail.paper_id).toBe('paper-1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${PAPERS_ENDPOINT}/paper-1`)
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ paper_ids: ['paper-1', 'paper-2'] })
    expect(fetchMock.mock.calls[1][0]).toBe(COMPARE_ENDPOINT)
    expect(comparison.fields[0].values[0].evidence[0]).toMatchObject({ page_number: 1, snippet: 'We measure attention.' })
    expect(search.results[0]).toMatchObject({ paper_id: 'paper-1', page_number: 2 })
    expect(String(fetchMock.mock.calls[2][0])).toContain(`${SEARCH_ENDPOINT}?q=attention&paper_ids=paper-1`)
  })

  it('accepts the backend dimensions, hits, and gap contracts', async () => {
    const backendCompare = {
      paper_ids: ['paper-1', 'paper-2'],
      papers: [{ ...storedPaperPayload('paper-1'), paper: { ...successfulPayload().paper, title: 'Attention study' } }, { ...storedPaperPayload('paper-2'), paper: { ...successfulPayload().paper, title: 'Second study' } }],
      dimensions: [{ name: 'methodology', entries: [{ paper_id: 'paper-1', title: 'Attention study', value: 'Interview study', evidence: [{ supporting_text: 'We interviewed participants.', source_pages: [3] }] }, { paper_id: 'paper-2', title: 'Second study', value: 'Survey', evidence: [] }] }],
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(backendCompare))
      .mockResolvedValueOnce(response({ query: 'participants', paper_ids: ['paper-1'], hits: [{ paper_id: 'paper-1', title: 'Attention study', snippet: 'Participants described the study.', supporting_text: 'Participants described the study.', source_pages: [3] }] }))
      .mockResolvedValueOnce(response({ paper_ids: ['paper-1'], gaps: [{ statement: 'An open question remains.', basis_type: 'open_question', evidence: [{ supporting_text: 'An open question remains.', source_pages: [4] }] }], note: null }))

    const comparison = await comparePapers(['paper-1', 'paper-2'], fetchMock)
    const search = await searchPapers('participants', ['paper-1'], fetchMock)
    const gaps = await getPaperGaps(['paper-1'], fetchMock)

    expect(comparison.fields[0].values[0].evidence[0]).toMatchObject({ paper_title: 'Attention study', page_number: 3 })
    expect(search.results[0]).toMatchObject({ paper_title: 'Attention study', snippet: 'Participants described the study.', page_number: 3 })
    expect(gaps.gaps[0]).toMatchObject({ gap: 'An open question remains.', basis: 'open_question' })
  })

  it('keeps an empty gap result deterministic and downloads markdown report payloads', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ gaps: [] }))
      .mockResolvedValueOnce(response({ markdown: '# Report\n\nEvidence.', filename: 'evidence.md' }))
    const gaps = await getPaperGaps(['paper-1'], fetchMock)
    const report = await generateReport(['paper-1'], fetchMock)

    expect(gaps.gaps).toEqual([])
    expect(report).toEqual({ markdown: '# Report\n\nEvidence.', filename: 'evidence.md' })
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ paper_ids: ['paper-1'] })
    expect(fetchMock.mock.calls[0][0]).toBe(GAPS_ENDPOINT)
    expect(fetchMock.mock.calls[1][0]).toBe(REPORT_ENDPOINT)
  })

  it('rejects malformed intelligence payloads and unavailable requests deterministically', async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(response({ results: [{ paper_id: 'paper-1' }] }))
    await expect(searchPapers('attention', undefined, malformed)).rejects.toMatchObject({ name: 'UploadApiError', kind: 'malformed', message: 'The backend returned an invalid analysis result. Please try again.' })
    const unavailable = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'))
    await expect(listPapers(unavailable)).rejects.toMatchObject({ kind: 'unavailable', message: 'The ResearchMind backend is unavailable. Check that FastAPI is running and try again.' })
  })
})
