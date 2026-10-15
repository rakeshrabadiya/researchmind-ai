import { describe, expect, it } from 'vitest'
import { MAX_PDF_SIZE_BYTES, validatePdf } from './uploadState'

function makeFile(name: string, type: string, content = 'research note') {
  return new File([content], name, { type })
}

describe('validatePdf', () => {
  it('accepts a PDF selected from the picker', () => {
    const file = makeFile('attention-study.pdf', 'application/pdf')

    expect(validatePdf(file)).toEqual({ valid: true, file })
  })

  it('accepts a PDF when the browser omits the MIME type', () => {
    const file = makeFile('field-notes.PDF', '')

    expect(validatePdf(file)).toEqual({ valid: true, file })
  })

  it('clears the upload state for an empty selection', () => {
    expect(validatePdf(null)).toEqual({
      valid: false,
      message: 'Choose a PDF to add to your research queue.',
    })
  })

  it('rejects a non-PDF file with a useful message', () => {
    expect(validatePdf(makeFile('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toEqual({
      valid: false,
      message: 'That file is not a PDF. Please choose a .pdf document.',
    })
  })

  it('rejects PDFs larger than the visible 25 MB limit', () => {
    const file = makeFile('large-study.pdf', 'application/pdf', 'x'.repeat(MAX_PDF_SIZE_BYTES + 1))

    expect(validatePdf(file)).toEqual({
      valid: false,
      message: 'That PDF is larger than 25 MB. Please choose a smaller document.',
    })
  })
})
