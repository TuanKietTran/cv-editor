// Express backend for the web deployment of cv-editor.
//
// Replaces the Tauri IPC commands in src-tauri/src/lib.rs with REST
// equivalents, and replaces the macOS-only WKWebView PDF export
// (src-tauri/src/pdf_export.m) with headless-Chromium rendering via
// Puppeteer. The markdown->HTML pipeline is imported verbatim from
// src/lib/markdown.ts so web output matches the desktop app exactly.
import express from 'express'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import puppeteer, { Browser } from 'puppeteer'
import { render } from '../src/lib/markdown.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(REPO_ROOT, 'dist')
const BUNDLED_TEMPLATES_DIR = path.join(REPO_ROOT, 'templates')

// Persistent data root — mount a volume here in the container.
const DATA_DIR = process.env.CV_DATA_DIR || path.join(REPO_ROOT, 'data')
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates')
const STATE_FILE = path.join(DATA_DIR, 'state.json')

const PORT = Number(process.env.PORT) || 8420

// ── storage helpers (mirrors src-tauri/src/lib.rs semantics) ──────────────

async function ensureInit(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(TEMPLATES_DIR, { recursive: true })
  const existing = await fs.readdir(TEMPLATES_DIR).catch(() => [])
  if (existing.length === 0) {
    const bundled = await fs.readdir(BUNDLED_TEMPLATES_DIR).catch(() => [])
    for (const f of bundled) {
      await fs.copyFile(path.join(BUNDLED_TEMPLATES_DIR, f), path.join(TEMPLATES_DIR, f))
    }
  }
}

async function readState(): Promise<{ last_project?: string | null }> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

async function writeState(state: { last_project?: string | null }): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2))
}

function safeName(name: string): string {
  // Same threat model as the desktop app assumes trusted local input; here
  // the client is untrusted (browser), so reject path traversal outright.
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw Object.assign(new Error('invalid name'), { status: 400 })
  }
  return name
}

async function listProjectDirs(): Promise<string[]> {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(() => [])
  return entries
    .filter(e => e.isDirectory() && e.name !== 'templates')
    .map(e => e.name)
    .sort()
}

// ── Puppeteer (single shared browser instance) ─────────────────────────────

let browserPromise: Promise<Browser> | null = null
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }).catch(e => {
      browserPromise = null // allow a retry on the next request instead of caching a dead launch forever
      throw e
    })
  }
  return browserPromise
}

// A4 at 96dpi (794 x 1123 px) — matches src-tauri/src/pdf_export.m exactly,
// for output-fidelity parity with the macOS native export.
async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 794, height: 1123 })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30_000 })
    await page.evaluateHandle('document.fonts.ready')
    await new Promise(r => setTimeout(r, 300)) // settle time, mirrors the 1.5s in pdf_export.m (fonts already awaited above)
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

// ── app ──────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: '20mb' }))

const api = express.Router()

api.post('/init', async (_req, res) => {
  await ensureInit()
  res.status(204).end()
})

api.get('/last-project', async (_req, res) => {
  const state = await readState()
  res.json(state.last_project ?? null)
})

api.post('/last-project', async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string') return res.status(400).json({ error: 'name required' })
  const state = await readState()
  state.last_project = name
  await writeState(state)
  res.status(204).end()
})

api.get('/projects', async (_req, res) => {
  res.json(await listProjectDirs())
})

api.get('/projects/:name', async (req, res) => {
  try {
    const name = safeName(req.params.name)
    const dir = path.join(DATA_DIR, name)
    const md = await fs.readFile(path.join(dir, 'content.md'), 'utf-8')
    const css = await fs.readFile(path.join(dir, 'style.css'), 'utf-8').catch(() => '')
    res.json({ md, css })
  } catch (e: any) {
    res.status(e.status ?? 404).json({ error: e.message })
  }
})

api.post('/projects/:name', async (req, res) => {
  try {
    const name = safeName(req.params.name)
    const { md, css } = req.body ?? {}
    if (typeof md !== 'string' || typeof css !== 'string') {
      return res.status(400).json({ error: 'md and css (strings) required' })
    }
    const dir = path.join(DATA_DIR, name)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'content.md'), md)
    await fs.writeFile(path.join(dir, 'style.css'), css)
    res.status(204).end()
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

api.get('/templates', async (_req, res) => {
  await ensureInit()
  const entries = await fs.readdir(TEMPLATES_DIR).catch(() => [])
  const names = entries.filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
  res.json(names)
})

api.get('/templates/:name', async (req, res) => {
  try {
    const name = safeName(req.params.name)
    await ensureInit()
    const md = await fs.readFile(path.join(TEMPLATES_DIR, `${name}.md`), 'utf-8')
    const css = await fs.readFile(path.join(TEMPLATES_DIR, `${name}.css`), 'utf-8').catch(() => '')
    res.json({ md, css })
  } catch (e: any) {
    res.status(e.status ?? 404).json({ error: e.message })
  }
})

api.post('/export-pdf', async (req, res) => {
  try {
    const { html, filename } = req.body ?? {}
    if (typeof html !== 'string') return res.status(400).json({ error: 'html (string) required' })
    const pdf = await htmlToPdf(html)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'cv.pdf').replace(/"/g, '')}"`)
    res.send(pdf)
  } catch (e: any) {
    console.error('export-pdf failed:', e)
    res.status(500).json({ error: e.message ?? String(e) })
  }
})

// Also exposed as a plain function for reuse by the MCP server (in-process,
// no HTTP hop) — see mcp-server/index.ts.
export async function renderPdf(md: string, css: string): Promise<Buffer> {
  const html = wrapHtml(render(md), css)
  return htmlToPdf(html)
}

function wrapHtml(bodyHtml: string, css: string, title = 'cv'): string {
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

app.use('/api', api)
app.use(express.static(DIST_DIR))
// SPA fallback for any non-API, non-file route.
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

async function main() {
  await ensureInit()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`cv-editor server listening on :${PORT}`)
  })
}

main().catch(e => {
  console.error('Fatal startup error:', e)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  try {
    if (browserPromise) {
      const b = await browserPromise
      await b.close()
    }
  } catch {
    // launch never succeeded or close failed — nothing to clean up
  }
  process.exit(0)
})
