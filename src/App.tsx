import { useCallback, useEffect, useRef, useState } from 'react'
import { open as dialogOpen, save as dialogSave, confirm as dialogConfirm } from '@tauri-apps/plugin-dialog'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './App.css'
import Toolbar from './components/Toolbar'
import EditorPane, { EditorTab } from './components/EditorPane'
import CvPreview from './components/CvPreview'
import { render } from './lib/markdown'
import { useAutoSave } from './hooks/useAutoSave'
import * as backend from './lib/backend'
import { isTauri } from './lib/backend'

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

  const { lastSaved, recordSave } = useAutoSave(
    content, stylesheetContent, projectName,
    () => { setMdDirty(false); setCssDirty(false) },
  )

  // ── Init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      await backend.initApp()

      const loadTemplate = async () => {
        const { md, css } = await backend.getTemplate('cv')
        setContent(md);  setPreviewContent(md)
        setStylesheetContent(css); setPreviewCss(css)
      }

      const lastProject = await backend.getLastProject()
      if (lastProject) {
        try {
          const data = await backend.openProject(lastProject)
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
    }
    init().catch(e => console.error('Init failed:', e))
  }, [])

  // ── Title bar / tab title ───────────────────────────────────────────
  useEffect(() => {
    const name = projectName ?? 'untitled'
    const title = dirty ? `● ${name} — CV Editor` : `${name} — CV Editor`
    if (isTauri()) {
      getCurrentWindow().setTitle(title)
    } else {
      document.title = title
    }
  }, [projectName, dirty])

  // ── Close warning ─────────────────────────────────────────────────────
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (isTauri()) {
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
    } else {
      const onBeforeUnload = (e: BeforeUnloadEvent) => {
        if (!dirtyRef.current) return
        e.preventDefault()
        e.returnValue = ''
      }
      window.addEventListener('beforeunload', onBeforeUnload)
      return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  // ── Editor change handlers ────────────────────────────────────────────
  const handleMdChange  = useCallback((doc: string) => { setContent(doc);           setMdDirty(true) }, [])
  const handleCssChange = useCallback((doc: string) => { setStylesheetContent(doc); setCssDirty(true) }, [])

  // ── Open ──────────────────────────────────────────────────────────────
  const handleOpen = async () => {
    if (isTauri()) {
      const p = await dialogOpen({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        multiple: false,
      })
      if (!p || typeof p !== 'string') return
      try {
        const data = await backend.openFileNative(p)
        setContent(data.md);  setPreviewContent(data.md)
        setStylesheetContent(data.css); setPreviewCss(data.css)
        setProjectName(data.project_name)
        setMdDirty(false); setCssDirty(false)
        setMdOpenKey(k => k + 1); setCssOpenKey(k => k + 1)
        await backend.saveProject(data.project_name, data.md, data.css)
        await backend.setLastProject(data.project_name)
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
    let name = projectName
    if (!name) {
      name = window.prompt('Project name:', 'cv')?.trim() ?? null
      if (!name) return
      setProjectName(name)
      await backend.setLastProject(name)
    }

    try {
      await backend.saveProject(name, content, stylesheetContent)
      setMdDirty(false); setCssDirty(false)
      recordSave()
    } catch (e) { console.error('Save failed:', e) }
  }, [projectName, content, stylesheetContent, recordSave])

  // ── Save As ───────────────────────────────────────────────────────────
  const handleSaveAs = async () => {
    const name = window.prompt('Save as project name:', projectName ?? 'cv')?.trim() ?? null
    if (!name) return
    try {
      await backend.saveProject(name, content, stylesheetContent)
      setProjectName(name)
      setMdDirty(false); setCssDirty(false)
      recordSave()
      await backend.setLastProject(name)
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
      try { await backend.writeFileNative(p, html) }
      catch (e) { console.error('Export HTML failed:', e) }
    } else {
      downloadBlob(new Blob([html], { type: 'text/html' }), `${name}.html`)
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
      try { await backend.exportPdfNative(html, p) }
      catch (e) { console.error('Export PDF failed:', e); alert(`Export PDF failed: ${e}`) }
    } else {
      try {
        const blob = await backend.exportPdf(html, `${name}.pdf`)
        downloadBlob(blob, `${name}.pdf`)
      } catch (e) { console.error('Export PDF failed:', e); alert(`Export PDF failed: ${e}`) }
    }
  }

  // ── Load template ─────────────────────────────────────────────────────
  const handleLoadTemplate = async (name: string) => {
    if (dirty) {
      if (isTauri()) {
        const ok = await dialogConfirm(
          `Load template "${name}"? Unsaved changes will be lost.`,
          { title: 'Load Template', kind: 'warning' }
        )
        if (!ok) return
      } else {
        const ok = window.confirm(`Load template "${name}"? Unsaved changes will be lost.`)
        if (!ok) return
      }
    }

    try {
      const { md, css } = await backend.getTemplate(name)
      setContent(md); setPreviewContent(md)
      setStylesheetContent(css); setPreviewCss(css)
    } catch (e) { console.error('Load template failed:', e); return }

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
