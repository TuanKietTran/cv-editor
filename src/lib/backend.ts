// Unified persistence/export client.
//
// In the Tauri desktop build this calls into the Rust commands via `invoke()`.
// In the web build (no Tauri runtime present) it calls the Express backend
// over `fetch()` instead. Every call site in the app goes through here so
// there is exactly one place that knows which transport is active.
import { invoke } from '@tauri-apps/api/core'

export const isTauri = () =>
  typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || res.statusText)
  }
  // 204s and similar have no body
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return res.json()
  return undefined as unknown as T
}

export async function initApp(): Promise<void> {
  if (isTauri()) { await invoke('init_app_dir'); return }
  await api('/init', { method: 'POST' })
}

export async function getLastProject(): Promise<string | null> {
  if (isTauri()) return invoke<string | null>('get_last_project')
  return api<string | null>('/last-project')
}

export async function setLastProject(name: string): Promise<void> {
  if (isTauri()) { await invoke('set_last_project', { name }); return }
  await api('/last-project', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function listProjects(): Promise<string[]> {
  if (isTauri()) return invoke<string[]>('list_projects')
  return api<string[]>('/projects')
}

export async function openProject(name: string): Promise<{ md: string; css: string }> {
  if (isTauri()) return invoke('open_project', { name })
  return api(`/projects/${encodeURIComponent(name)}`)
}

export async function saveProject(name: string, md: string, css: string): Promise<void> {
  if (isTauri()) { await invoke('save_project', { name, md, css }); return }
  await api(`/projects/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ md, css }),
  })
}

export async function listTemplates(): Promise<string[]> {
  if (isTauri()) return invoke<string[]>('list_templates')
  return api<string[]>('/templates')
}

export async function getTemplate(name: string): Promise<{ md: string; css: string }> {
  if (isTauri()) {
    const mdPath = await invoke<string>('get_template_path', { name: `${name}.md` })
    const cssPath = await invoke<string>('get_template_path', { name: `${name}.css` })
    const md = await invoke<string>('read_file', { path: mdPath })
    let css = ''
    try { css = await invoke<string>('read_file', { path: cssPath }) } catch { /* no paired css */ }
    return { md, css }
  }
  return api(`/templates/${encodeURIComponent(name)}`)
}

// Desktop-only: opens an arbitrary local .md path (+ sibling .css) via the
// native file dialog. Deliberately has no web equivalent — the REST backend
// does not expose arbitrary filesystem paths to the browser.
export async function openFileNative(mdPath: string): Promise<{ md: string; css: string; project_name: string }> {
  return invoke('open_file', { mdPath })
}

// Desktop-only: writes an arbitrary local path via a native save dialog.
// (Web export uses exportPdf()/blob download instead — see App.tsx.)
export async function writeFileNative(path: string, content: string): Promise<void> {
  await invoke('write_file', { path, content })
}

export async function exportPdfNative(html: string, path: string): Promise<void> {
  await invoke('export_pdf_native', { html, path })
}

// Web-only: renders HTML server-side (headless Chromium) and returns a PDF blob.
export async function exportPdf(html: string, filename: string): Promise<Blob> {
  const res = await fetch('/api/export-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, filename }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || res.statusText)
  }
  return res.blob()
}
