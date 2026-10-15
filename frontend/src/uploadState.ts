export type UploadValidation =
  | { valid: true; file: File }
  | { valid: false; message: string }

export const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024

export function validatePdf(file: File | null | undefined): UploadValidation {
  if (!file) {
    return { valid: false, message: 'Choose a PDF to add to your research queue.' }
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    return { valid: false, message: 'That file is not a PDF. Please choose a .pdf document.' }
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return { valid: false, message: 'That PDF is larger than 25 MB. Please choose a smaller document.' }
  }

  return { valid: true, file }
}
