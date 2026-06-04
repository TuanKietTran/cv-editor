import Editor from '../ux/editor'
import './EditorPane.css'

export type EditorTab = 'md' | 'css'

interface Props {
  activeTab: EditorTab
  mdKey: string
  cssKey: string
  mdContent: string
  cssContent: string
  onMdChange: (doc: string) => void
  onCssChange: (doc: string) => void
}

export default function EditorPane({
  activeTab,
  mdKey,
  cssKey,
  mdContent,
  cssContent,
  onMdChange,
  onCssChange,
}: Props) {
  return (
    <div className="editor-pane">
      <div className="editor-bodies">
        <div className={`editor-body${activeTab !== 'md' ? ' hidden' : ''}`}>
          <Editor key={mdKey} initialDoc={mdContent} onChange={onMdChange} />
        </div>
        <div className={`editor-body${activeTab !== 'css' ? ' hidden' : ''}`}>
          <Editor key={cssKey} initialDoc={cssContent} onChange={onCssChange} language="css" />
        </div>
      </div>
    </div>
  )
}
