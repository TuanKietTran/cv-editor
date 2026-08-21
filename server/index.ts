// Express backend for the web deployment of cv-editor.
//
// Replaces the Tauri IPC commands in src-tauri/src/lib.rs with REST
// equivalents, and replaces the macOS-only WKWebView PDF export
// (src-tauri/src/pdf_export.m) with headless-Chromium rendering via
// Puppeteer (server/render.ts). Storage logic lives in server/store.ts so
// the MCP server (mcp-server/index.ts) can reuse it in-process, without an
// HTTP hop back into this app.
import express from 'express'
import path from 'node:path'
import * as store from './store.ts'
import { htmlToPdf, closeBrowser } from './render.ts'

const PORT = Number(process.env.PORT) || 8420

const app = express()
app.use(express.json({ limit: '20mb' }))

const api = express.Router()

api.post('/init', async (_req, res) => {
  await store.ensureInit()
  res.status(204).end()
})

api.get('/last-project', async (_req, res) => {
  const state = await store.readState()
  res.json(state.last_project ?? null)
})

api.post('/last-project', async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string') return res.status(400).json({ error: 'name required' })
  const state = await store.readState()
  state.last_project = name
  await store.writeState(state)
  res.status(204).end()
})

api.get('/projects', async (_req, res) => {
  res.json(await store.listProjectDirs())
})

api.get('/projects/:name', async (req, res) => {
  try {
    res.json(await store.openProject(req.params.name))
  } catch (e: any) {
    res.status(e.status ?? 404).json({ error: e.message })
  }
})

api.post('/projects/:name', async (req, res) => {
  try {
    const { md, css } = req.body ?? {}
    if (typeof md !== 'string' || typeof css !== 'string') {
      return res.status(400).json({ error: 'md and css (strings) required' })
    }
    await store.saveProject(req.params.name, md, css)
    res.status(204).end()
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message })
  }
})

api.get('/templates', async (_req, res) => {
  res.json(await store.listTemplateNames())
})

api.get('/templates/:name', async (req, res) => {
  try {
    res.json(await store.getTemplate(req.params.name))
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

app.use('/api', api)
app.use(express.static(store.DIST_DIR))
// SPA fallback for any non-API, non-file route.
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(store.DIST_DIR, 'index.html'))
})

async function main() {
  await store.ensureInit()
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`cv-editor server listening on :${PORT}`)
  })
}

main().catch(e => {
  console.error('Fatal startup error:', e)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  await closeBrowser()
  process.exit(0)
})
