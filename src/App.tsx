import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open as dialogOpen, save as dialogSave, confirm as dialogConfirm } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'
import Toolbar from './components/Toolbar'
import EditorPane, { EditorTab } from './components/EditorPane'
import CvPreview from './components/CvPreview'
import { render } from './lib/markdown'
import { useAutoSave } from './hooks/useAutoSave'

const isTauri = () => typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

function pickFile(accept: string, onLoad: (content: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onLoad(reader.result as string)
    reader.readAsText(file)
  }
  input.click()
}

function App() {
  const [projectName, setProjectName]     = useState<string | null>(null)
  const [content, setContent]             = useState<string>('')
  const [mdDirty, setMdDirty]             = useState(false)

  const [stylesheetContent, setStylesheetContent] = useState<string>('')
  const [cssDirty, setCssDirty]                   = useState(false)

  const [activeTab, setActiveTab] = useState<EditorTab>('md')
  const [mdOpenKey,  setMdOpenKey]  = useState(0)
  const [cssOpenKey, setCssOpenKey] = useState(0)

  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewCss, setPreviewCss]         = useState<string>('')
  useEffect(() => {
    const t = setTimeout(() => setPreviewContent(content), 200)
    return () => clearTimeout(t)
  }, [content])
  useEffect(() => {
    const t = setTimeout(() => setPreviewCss(stylesheetContent), 200)
    return () => clearTimeout(t)
  }, [stylesheetContent])

  const dirty = mdDirty || cssDirty

  const { lastSaved, recordSave, getWebAutosave } = useAutoSave(
    content, stylesheetContent, projectName,
    () => { setMdDirty(false); setCssDirty(false) },
  )

  // ── Init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (isTauri()) {
        await invoke('init_app_dir')

        const loadTemplate = async () => {
          const mdPath  = await invoke<string>('get_template_path', { name: 'cv.md' })
          const cssPath = await invoke<string>('get_template_path', { name: 'cv.css' })
          const md  = await invoke<string>('read_file', { path: mdPath })
          const css = await invoke<string>('read_file', { path: cssPath })
          setContent(md);  setPreviewContent(md)
          setStylesheetContent(css); setPreviewCss(css)
        }

        const lastProject = await invoke<string | null>('get_last_project')
        if (lastProject) {
          try {
            const data = await invoke<{ md: string; css: string }>('open_project', { name: lastProject })
            setContent(data.md);  setPreviewContent(data.md)
            setStylesheetContent(data.css); setPreviewCss(data.css)
            setProjectName(lastProject)
          } catch {
            await loadTemplate()
          }
        } else {
          await loadTemplate()
        }
        setMdOpenKey(k => k + 1)
        setCssOpenKey(k => k + 1)
      } else {
        const saved = getWebAutosave()
        if (saved.md)  { setContent(saved.md);  setPreviewContent(saved.md)  }
        if (saved.css) { setStylesheetContent(saved.css); setPreviewCss(saved.css) }
        setMdOpenKey(k => k + 1)
        setCssOpenKey(k => k + 1)
      }
    }
    init()
  }, [])

  // ── Title bar ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTauri()) return
    const name = projectName ?? 'untitled'
    getCurrentWindow().setTitle(dirty ? `● ${name} — CV Editor` : `${name} — CV Editor`)
  }, [projectName, dirty])

  // ── Close warning ─────────────────────────────────────────────────────
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | null = null
    getCurrentWindow().onCloseRequested(async (event) => {
      if (dirtyRef.current) {
        const ok = await dialogConfirm('You have unsaved changes. Close anyway?', {
          title: 'Unsaved Changes', kind: 'warning',
        })
        if (!ok) event.preventDefault()
      }
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // ── Editor change handlers ────────────────────────────────────────────
  const handleMdChange  = useCallback((doc: string) => { setContent(doc);           setMdDirty(true) }, [])
  const handleCssChange = useCallback((doc: string) => { setStylesheetContent(doc); setCssDirty(true) }, [])

  // ── Open ──────────────────────────────────────────────────────────────
  const handleOpen = async () => {
    if (isTauri()) {
      const appDir = await invoke<string>('get_app_dir')
      const p = await dialogOpen({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: appDir,
        multiple: false,
      })
      if (!p || typeof p !== 'string') return
      try {
        const data = await invoke<{ md: string; css: string; project_name: string }>('open_file', { mdPath: p })
        setContent(data.md);  setPreviewContent(data.md)
        setStylesheetContent(data.css); setPreviewCss(data.css)
        setProjectName(data.project_name)
        setMdDirty(false); setCssDirty(false)
        setMdOpenKey(k => k + 1); setCssOpenKey(k => k + 1)
        // Persist immediately so reopen works even if the app closes before autosave fires
        await invoke('save_project', { name: data.project_name, md: data.md, css: data.css })
        await invoke('set_last_project', { name: data.project_name })
        recordSave()
      } catch (e) { console.error('Open failed:', e) }
    } else {
      if (activeTab === 'css') {
        pickFile('.css', (css) => {
          setStylesheetContent(css); setPreviewCss(css)
          setCssDirty(false); setCssOpenKey(k => k + 1)
        })
      } else {
        pickFile('.md', (text) => {
          setContent(text); setPreviewContent(text)
          setMdDirty(false); setMdOpenKey(k => k + 1)
        })
      }
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!isTauri()) return

    let name = projectName
    if (!name) {
      name = window.prompt('Project name:', 'cv')?.trim() ?? null
      if (!name) return
      setProjectName(name)
      await invoke('set_last_project', { name })
    }

    try {
      await invoke('save_project', { name, md: content, css: stylesheetContent })
      setMdDirty(false); setCssDirty(false)
      recordSave()
    } catch (e) { console.error('Save failed:', e) }
  }, [projectName, content, stylesheetContent, recordSave])

  // ── Save As ───────────────────────────────────────────────────────────
  const handleSaveAs = async () => {
    if (!isTauri()) return
    const name = window.prompt('Save as project name:', projectName ?? 'cv')?.trim() ?? null
    if (!name) return
    try {
      await invoke('save_project', { name, md: content, css: stylesheetContent })
      setProjectName(name)
      setMdDirty(false); setCssDirty(false)
      recordSave()
      await invoke('set_last_project', { name })
    } catch (e) { console.error('Save As failed:', e) }
  }

  // ── Export ────────────────────────────────────────────────────────────
  const buildExportHtml = () => {
    const html = render(content)
    const name = projectName ?? 'cv'
    return { name, html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name}</title>
<style>
${stylesheetContent}
</style>
</head>
<body>
${html}
</body>
</html>` }
  }

  const handleExportHtml = async () => {
    const { html, name } = buildExportHtml()
    if (isTauri()) {
      const p = await dialogSave({ filters: [{ name: 'HTML', extensions: ['html'] }], defaultPath: `${name}.html` })
      if (!p) return
      try { await invoke('write_file', { path: p, content: html }) }
      catch (e) { console.error('Export HTML failed:', e) }
    } else {
      const blob = new Blob([html], { type: 'text/html' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `${name}.html`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }

  const handleExportPdf = async () => {
    const { html, name } = buildExportHtml()
    if (isTauri()) {
      const p = await dialogSave({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: `${name}.pdf`,
      })
      if (!p) return
      try { await invoke('export_pdf_native', { html, path: p }) }
      catch (e) { console.error('Export PDF failed:', e); alert(`Export PDF failed: ${e}`) }
    } else {
      const blob   = new Blob([html], { type: 'text/html' })
      const url    = URL.createObjectURL(blob)
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:0;height:0;border:none'
      iframe.src = url
      document.body.appendChild(iframe)
      iframe.onload = () => {
        iframe.contentWindow?.print()
        setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url) }, 2000)
      }
    }
  }

  // ── Load template ─────────────────────────────────────────────────────
  const handleLoadTemplate = async (name: string) => {
    if (dirty) {
      const ok = await dialogConfirm(
        `Load template "${name}"? Unsaved changes will be lost.`,
        { title: 'Load Template', kind: 'warning' }
      )
      if (!ok) return
    }

    const mdPath  = await invoke<string>('get_template_path', { name: `${name}.md` })
    const cssPath = await invoke<string>('get_template_path', { name: `${name}.css` })

    try {
      const text = await invoke<string>('read_file', { path: mdPath })
      setContent(text); setPreviewContent(text)
    } catch (e) { console.error('Load template MD failed:', e); return }

    try {
      const css = await invoke<string>('read_file', { path: cssPath })
      setStylesheetContent(css); setPreviewCss(css)
    } catch { /* no paired CSS — keep current */ }

    setProjectName(null)
    setMdDirty(false); setCssDirty(false)
    setMdOpenKey(k => k + 1); setCssOpenKey(k => k + 1)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  const handleSaveRef    = useRef(handleSave)
  const handleSaveAsRef  = useRef(handleSaveAs)
  const handleOpenRef    = useRef(handleOpen)
  handleSaveRef.current   = handleSave
  handleSaveAsRef.current = handleSaveAs
  handleOpenRef.current   = handleOpen
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 's') { e.preventDefault(); e.shiftKey ? handleSaveAsRef.current() : handleSaveRef.current() }
      if (e.key === 'o') { e.preventDefault(); handleOpenRef.current() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="app">
      <Toolbar
        projectName={projectName}
        dirty={dirty}
        lastSaved={lastSaved}
        activeTab={activeTab}
        mdDirty={mdDirty}
        cssDirty={cssDirty}
        onTabChange={setActiveTab}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExportHtml={handleExportHtml}
        onExportPdf={handleExportPdf}
        onLoadTemplate={handleLoadTemplate}
      />
      <div className="app-main">
        <EditorPane
          activeTab={activeTab}
          mdKey={`md-${mdOpenKey}`}
          cssKey={`css-${cssOpenKey}`}
          mdContent={content}
          cssContent={stylesheetContent}
          onMdChange={handleMdChange}
          onCssChange={handleCssChange}
        />
        <CvPreview content={previewContent} css={previewCss} />
      </div>
    </div>
  )
}

export default App
