// Storage + template logic shared by the Express app (server/index.ts) and
// the MCP server (mcp-server/index.ts), so both talk to the same on-disk
// project store without an HTTP hop between them.
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(__dirname, '..')
export const DIST_DIR = path.join(REPO_ROOT, 'dist')
export const BUNDLED_TEMPLATES_DIR = path.join(REPO_ROOT, 'templates')

// Persistent data root — mount a volume here in the container.
export const DATA_DIR = process.env.CV_DATA_DIR || path.join(REPO_ROOT, 'data')
export const TEMPLATES_DIR = path.join(DATA_DIR, 'templates')
export const STATE_FILE = path.join(DATA_DIR, 'state.json')

export async function ensureInit(): Promise<void> {
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

export async function readState(): Promise<{ last_project?: string | null }> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

export async function writeState(state: { last_project?: string | null }): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2))
}

export function safeName(name: string): string {
  if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw Object.assign(new Error('invalid name'), { status: 400 })
  }
  return name
}

export async function listProjectDirs(): Promise<string[]> {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(() => [])
  return entries
    .filter(e => e.isDirectory() && e.name !== 'templates')
    .map(e => e.name)
    .sort()
}

export async function openProject(name: string): Promise<{ md: string; css: string }> {
  const dir = path.join(DATA_DIR, safeName(name))
  const md = await fs.readFile(path.join(dir, 'content.md'), 'utf-8')
  const css = await fs.readFile(path.join(dir, 'style.css'), 'utf-8').catch(() => '')
  return { md, css }
}

export async function saveProject(name: string, md: string, css: string): Promise<void> {
  const dir = path.join(DATA_DIR, safeName(name))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'content.md'), md)
  await fs.writeFile(path.join(dir, 'style.css'), css)
}

export async function listTemplateNames(): Promise<string[]> {
  await ensureInit()
  const entries = await fs.readdir(TEMPLATES_DIR).catch(() => [])
  return entries.filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
}

export async function getTemplate(name: string): Promise<{ md: string; css: string }> {
  await ensureInit()
  const safe = safeName(name)
  const md = await fs.readFile(path.join(TEMPLATES_DIR, `${safe}.md`), 'utf-8')
  const css = await fs.readFile(path.join(TEMPLATES_DIR, `${safe}.css`), 'utf-8').catch(() => '')
  return { md, css }
}
