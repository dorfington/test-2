/**
 * Reads the text of a pay stub on the device. Nothing is uploaded:
 * - PDFs with a text layer (payroll-site downloads) are read exactly with pdf.js.
 * - Photos and scanned PDFs go through Tesseract OCR in a web worker.
 * This module is loaded on demand, so neither library is in the main bundle.
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { linesFromTextItems, type TextItem } from './lines'

export interface Progress {
  stage: string
  /** 0..1 when known. */
  fraction?: number
}

export interface Extracted {
  text: string
  method: 'pdf-text' | 'ocr'
}

const MAX_PDF_PAGES = 3

export async function extractText(file: File, onProgress: (p: Progress) => void): Promise<Extracted> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (isPdf) {
    onProgress({ stage: 'Reading PDF' })
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES)
    const lines: string[] = []
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      lines.push(...linesFromTextItems(content.items as TextItem[]))
    }
    const text = lines.join('\n')
    if (text.replace(/\s/g, '').length >= 40) return { text, method: 'pdf-text' }

    // Scanned PDF: render the pages and OCR them.
    const canvases: HTMLCanvasElement[] = []
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 2.5 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
      canvases.push(canvas)
    }
    return { text: await ocr(canvases, onProgress), method: 'ocr' }
  }

  onProgress({ stage: 'Preparing photo' })
  const canvas = await prepareImage(file)
  return { text: await ocr([canvas], onProgress), method: 'ocr' }
}

/** Loads a photo (HEIC works in Safari via <img>), fixes orientation, scales and boosts contrast for OCR. */
async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    const longest = Math.max(img.naturalWidth, img.naturalHeight)
    const scale = Math.min(3000 / longest, Math.max(1, 2000 / Math.min(img.naturalWidth, img.naturalHeight)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    // Grayscale + contrast stretch (1st..99th percentile) helps with shadows and dim light.
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const px = data.data
    const hist = new Uint32Array(256)
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
      px[i] = g
      hist[g]++
    }
    const total = px.length / 4
    let lo = 0
    let hi = 255
    for (let c = 0, acc = 0; c < 256; c++) if ((acc += hist[c]) > total * 0.01) { lo = c; break }
    for (let c = 255, acc = 0; c >= 0; c--) if ((acc += hist[c]) > total * 0.01) { hi = c; break }
    const range = Math.max(1, hi - lo)
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range))
      px[i] = px[i + 1] = px[i + 2] = v
    }
    ctx.putImageData(data, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function ocr(canvases: HTMLCanvasElement[], onProgress: (p: Progress) => void): Promise<string> {
  onProgress({ stage: 'Loading the text reader (first time only)' })
  const { createWorker, PSM } = await import('tesseract.js')
  let page = 0
  // Engine and language data are served by this site (see ocr-assets.ts), not a CDN.
  const at = (p: string) => new URL(p, document.baseURI).href
  const worker = await createWorker('eng', 1, {
    workerPath: at('ocr/worker.min.js'),
    corePath: at('ocr/core'),
    langPath: at('ocr/lang'),
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress({ stage: canvases.length > 1 ? `Reading page ${page + 1} of ${canvases.length}` : 'Reading your pay stub', fraction: (page + m.progress) / canvases.length })
      }
    },
  })
  try {
    // Treat the stub as one block so each printed row comes out as one line (label + its amounts).
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' })
    const texts: string[] = []
    for (page = 0; page < canvases.length; page++) {
      const { data } = await worker.recognize(canvases[page])
      texts.push(data.text)
    }
    return texts.join('\n')
  } finally {
    await worker.terminate()
  }
}
