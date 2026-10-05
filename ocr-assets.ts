/**
 * Serves the OCR engine and English language data from this site instead of
 * a public CDN, so reading a pay stub never contacts a third party.
 * Files are copied from node_modules at build time (and served from there in dev).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const nm = (p: string) => path.resolve(root, 'node_modules', p)

/** Published path (under ocr/) -> source file. Each device downloads one core variant. */
export const OCR_FILES: Record<string, string> = {
  'ocr/worker.min.js': nm('tesseract.js/dist/worker.min.js'),
  'ocr/core/tesseract-core-lstm.wasm.js': nm('tesseract.js-core/tesseract-core-lstm.wasm.js'),
  'ocr/core/tesseract-core-simd-lstm.wasm.js': nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'),
  'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js': nm('tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'),
  'ocr/lang/eng.traineddata.gz': nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
}

export function ocrAssets(): Plugin {
  return {
    name: 'ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rel = req.url?.split('?')[0].replace(/^\//, '')
        const src = rel && OCR_FILES[rel]
        if (!src) return next()
        res.setHeader('Content-Type', rel.endsWith('.gz') ? 'application/gzip' : 'text/javascript')
        fs.createReadStream(src).pipe(res)
      })
    },
    generateBundle() {
      for (const [fileName, src] of Object.entries(OCR_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(src) })
      }
    },
  }
}
