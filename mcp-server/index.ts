#!/usr/bin/env node
// MCP server exposing cv-editor's project storage, templates, and PDF
// rendering as tools, so a Claude Code agent can drive cv-editor directly
// without a browser.
//
// Reuses server/store.ts and server/render.ts in-process (same functions
// the Express backend uses) rather than calling the REST API over HTTP —
// no redundant network hop, and guaranteed identical behavior to the web
// deployment.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs/promises'
import * as store from '../server/store.ts'
import { renderPdf, closeBrowser } from '../server/render.ts'

const OUTPUT_DIR = process.env.CV_MCP_OUTPUT_DIR || path.join(store.DATA_DIR, 'mcp-exports')

const server = new McpServer({
  name: 'cv-editor',
  version: '0.1.0',
})

server.tool(
  'list_projects',
  'List saved CV project names in the cv-editor data store.',
  {},
  async () => {
    const names = await store.listProjectDirs()
    return { content: [{ type: 'text', text: JSON.stringify(names) }] }
  },
)

server.tool(
  'open_project',
  'Open a saved CV project and return its markdown content and CSS.',
  { name: z.string().describe('Project name, as returned by list_projects') },
  async ({ name }) => {
    try {
      const { md, css } = await store.openProject(name)
      return { content: [{ type: 'text', text: JSON.stringify({ md, css }) }] }
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
    }
  },
)

server.tool(
  'save_project',
  'Create or overwrite a CV project with the given markdown content and CSS.',
  {
    name: z.string().describe('Project name to save under'),
    md: z.string().describe('CV content as markdown'),
    css: z.string().describe('Stylesheet for the CV'),
  },
  async ({ name, md, css }) => {
    try {
      await store.saveProject(name, md, css)
      return { content: [{ type: 'text', text: `Saved project "${name}".` }] }
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
    }
  },
)

server.tool(
  'list_templates',
  'List available CV templates (each is a paired .md + .css).',
  {},
  async () => {
    const names = await store.listTemplateNames()
    return { content: [{ type: 'text', text: JSON.stringify(names) }] }
  },
)

server.tool(
  'get_template',
  'Fetch a template\'s markdown content and CSS by name.',
  { name: z.string().describe('Template name, as returned by list_templates') },
  async ({ name }) => {
    try {
      const { md, css } = await store.getTemplate(name)
      return { content: [{ type: 'text', text: JSON.stringify({ md, css }) }] }
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
    }
  },
)

server.tool(
  'render_pdf',
  'Render markdown + CSS to a PDF via headless Chromium (same pipeline as the desktop app\'s native export) and write it to disk. Returns the absolute path of the generated PDF.',
  {
    markdown: z.string().describe('CV content as markdown'),
    css: z.string().describe('Stylesheet for the CV'),
    filename: z.string().optional().describe('Output filename (without directory); defaults to a timestamped name'),
  },
  async ({ markdown, css, filename }) => {
    try {
      const pdf = await renderPdf(markdown, css)
      await fs.mkdir(OUTPUT_DIR, { recursive: true })
      const name = (filename?.trim() || `cv-${Date.now()}`).replace(/\.pdf$/i, '') + '.pdf'
      const outPath = path.join(OUTPUT_DIR, name)
      await fs.writeFile(outPath, pdf)
      return { content: [{ type: 'text', text: outPath }] }
    } catch (e: any) {
      return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
    }
  },
)

async function main() {
  await store.ensureInit()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(e => {
  console.error('cv-editor MCP server failed to start:', e)
  process.exit(1)
})

process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0) })
process.on('SIGINT', async () => { await closeBrowser(); process.exit(0) })
