// PDF reader: loads a PDF file, renders pages to canvas for analysis and display.
// Uses pdfjs-dist. The worker is loaded from the same package via Vite's URL import.

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// Load a PDF file (File or ArrayBuffer) and return a document proxy.
export async function loadPdf(file) {
  const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buf })
  return await loadingTask.promise
}

// Render a page to a canvas at a given scale and return { canvas, imageData, viewport }.
// scale: 1.5 is a good default for analysis (enough detail, not too slow).
export async function renderPage(pdfDoc, pageNumber, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  await page.render({ canvasContext: ctx, viewport }).promise
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { canvas, imageData, viewport, page }
}

// Get the number of pages in the document.
export async function getPageCount(pdfDoc) {
  return pdfDoc.numPages
}
