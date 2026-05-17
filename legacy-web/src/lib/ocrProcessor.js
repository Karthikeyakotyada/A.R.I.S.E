import { createWorker } from 'tesseract.js'

/**
 * Extract text from an image URL using Tesseract.js OCR.
 *
 * @param {string} fileUrl   - Public URL of the uploaded file
 * @param {string} fileType  - MIME type (e.g. 'image/jpeg', 'application/pdf')
 * @returns {Promise<{ text: string|null, error: string|null }>}
 */
export async function extractTextFromImage(fileUrl, fileType) {
  // PDFs cannot be OCR'd client-side without a canvas renderer
  if (fileType === 'application/pdf') {
    return {
      text: null,
      error: 'PDF_NOT_SUPPORTED',
    }
  }

  const worker = await createWorker('eng', 1, {
    // Suppress tesseract.js console logs in production
    logger: () => {},
    errorHandler: () => {},
  })

  try {
    const { data } = await worker.recognize(fileUrl)
    await worker.terminate()
    return { text: data.text || '', error: null }
  } catch (err) {
    await worker.terminate()
    return { text: null, error: err.message || 'OCR_FAILED' }
  }
}
