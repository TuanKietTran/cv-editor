import TemplateMenu from './TemplateMenu'
import { EditorTab } from './EditorPane'
import './Toolbar.css'

interface Props {
  projectName: string | null
  dirty: boolean
  lastSaved: Date | null
  activeTab: EditorTab
  mdDirty: boolean
  cssDirty: boolean
  onTabChange: (tab: EditorTab) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportHtml: () => void
  onExportPdf: () => void
  onExportImage: (format: 'png' | 'jpeg') => void
  onLoadTemplate: (name: string) => void
}

function formatSaved(d: Date): string {
  const secs = Math.round((Date.now() - d.getTime()) / 1000)
  if (secs < 5)  return 'just now'
  if (secs < 60) return `${secs}s ago`
  return `${Math.round(secs / 60)}m ago`
}

export default function Toolbar({
  projectName,
  dirty,
  lastSaved,
  activeTab,
  mdDirty,
  cssDirty,
  onTabChange,
  onOpen,
  onSave,
  onSaveAs,
  onExportHtml,
  onExportPdf,
  onExportImage,
  onLoadTemplate,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <TemplateMenu onSelect={onLoadTemplate} />
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={onOpen} title="Open project (⌘O)">
          Open
        </button>
        <button
          className={`toolbar-btn${dirty ? ' toolbar-btn-save-active' : ''}`}
          onClick={onSave}
          title="Save project (⌘S)"
        >
          Save
        </button>
        <button className="toolbar-btn toolbar-btn-secondary" onClick={onSaveAs} title="Save as new project (⌘⇧S)">
          Save As
        </button>
        <div className="toolbar-divider" />
        <button className="toolbar-btn" onClick={onExportHtml} title="Export HTML">
          Export HTML
        </button>
        <button className="toolbar-btn" onClick={onExportPdf} title="Export PDF">
          Export PDF
        </button>
        <button className="toolbar-btn" onClick={() => onExportImage('png')} title="Export PNG">
          Export PNG
        </button>
        <button className="toolbar-btn" onClick={() => onExportImage('jpeg')} title="Export JPEG">
          Export JPEG
        </button>
        <div className="toolbar-divider" />
        <div className="toolbar-seg" role="group" aria-label="Editor mode">
          <button
            className={`toolbar-seg-btn${activeTab === 'md' ? ' active' : ''}`}
            onClick={() => onTabChange('md')}
          >
            Content{mdDirty && <span className="seg-dot">●</span>}
          </button>
          <button
            className={`toolbar-seg-btn${activeTab === 'css' ? ' active' : ''}`}
            onClick={() => onTabChange('css')}
          >
            Style{cssDirty && <span className="seg-dot">●</span>}
          </button>
        </div>
      </div>

      <div className="toolbar-center">
        <span className="toolbar-filename">
          {dirty && <span className="toolbar-dirty">●</span>}
          {projectName ?? 'untitled'}
        </span>
      </div>

      <div className="toolbar-right">
        {lastSaved && (
          <span className="toolbar-autosave" title={`Autosaved at ${lastSaved.toLocaleTimeString()}`}>
            saved {formatSaved(lastSaved)}
          </span>
        )}
      </div>
    </div>
  )
}
