// Headless-Chromium HTML->PDF rendering, shared by the Express app and the
// MCP server. A4 at 96dpi (794 x 1123 px) matches src-tauri/src/pdf_export.m
// (WKWebView.createPDF) exactly, for output-fidelity parity with the
// macOS-native desktop export.
import puppeteer, { Browser } from 'puppeteer'
import { render } from '../src/lib/markdown.ts'

let browserPromise: Promise<Browser> | null = null
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }).catch(e => {
      browserPromise = null // allow a retry on the next call instead of caching a dead launch forever
      throw e
    })
  }
  return browserPromise
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 794, height: 1123 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
    await page.evaluateHandle('document.fonts.ready')
    await new Promise(r => setTimeout(r, 300))
    const buf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })
    return Buffer.from(buf)
  } finally {
    await page.close()
  }
}

export function wrapHtml(bodyHtml: string, css: string, title = 'cv'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

export async function renderPdf(md: string, css: string, title = 'cv'): Promise<Buffer> {
  const html = wrapHtml(render(md), css, title)
  return htmlToPdf(html)
}

export async function closeBrowser(): Promise<void> {
  try {
    if (browserPromise) {
      const b = await browserPromise
      await b.close()
    }
  } catch {
    // launch never succeeded or close failed — nothing to clean up
  }
}
