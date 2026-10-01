import { useCallback, useEffect, useRef, useState } from 'react'
import { cvImportApi } from '../lib/cvImportApi'
import type { CvImportJob, CvImportPreview, CvPipelineCapabilities, CvTemplate } from '../types/cvImport'
import './CvImportDialog.css'

// Keep desktop/browser uploads deliberately small for the first client release.
// The effective limit is the lower of this value and the server capability.
const CLIENT_MAX_BYTES = 5 * 1024 * 1024
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
}
const ACCEPTED_TYPES = new Set(Object.values(MEDIA_TYPE_BY_EXTENSION))
const TERMINAL_STATES = new Set(['succeeded', 'failed', 'cancelled'])

interface Props {
  onClose: () => void
  onApply: (preview: CvImportPreview, filename: string) => void
}

interface QueueItem {
  key: string
  file: File
  job?: CvImportJob
  preview?: CvImportPreview
  error?: string
  uploading?: boolean
}

const readableBytes = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.ceil(bytes / 1024)} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export default function CvImportDialog({ onClose, onApply }: Props) {
  const [capabilities, setCapabilities] = useState<CvPipelineCapabilities | null>(null)
  const [templates, setTemplates] = useState<CvTemplate[]>([])
  const [templateKey, setTemplateKey] = useState('pipeline-default:1')
  const [items, setItems] = useState<QueueItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [globalError, setGlobalError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    let active = true
    Promise.all([cvImportApi.capabilities(), cvImportApi.templates()])
      .then(([caps, availableTemplates]) => {
        if (!active) return
        setCapabilities(caps)
        setTemplates(availableTemplates)
        const preferred = availableTemplates.find(t => t.id === 'pipeline-default') || availableTemplates[0]
        if (preferred) setTemplateKey(`${preferred.id}:${preferred.version}`)
        if (!caps.available) setGlobalError(caps.degradedReason || 'CV extraction is unavailable.')
      })
      .catch(error => active && setGlobalError(error instanceof Error ? error.message : String(error)))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  useEffect(() => {
    const poll = window.setInterval(async () => {
      const pending = itemsRef.current.filter(item => item.job && !TERMINAL_STATES.has(item.job.state))
      if (!pending.length) return
      await Promise.all(pending.map(async item => {
        try {
          const job = await cvImportApi.get(item.job!.id)
          setItems(current => current.map(candidate => candidate.key === item.key ? { ...candidate, job } : candidate))
        } catch (error) {
          setItems(current => current.map(candidate => candidate.key === item.key
            ? { ...candidate, error: error instanceof Error ? error.message : String(error) }
            : candidate))
        }
      }))
    }, 900)
    return () => window.clearInterval(poll)
  }, [])

  const selected = items.find(item => item.key === selectedKey)
  const maxBytes = Math.min(CLIENT_MAX_BYTES, capabilities?.maxUploadBytes || CLIENT_MAX_BYTES)

  const addFiles = useCallback((incoming: File[]) => {
    setGlobalError('')
    const additions: QueueItem[] = []
    const errors: string[] = []
    for (const original of incoming) {
      const extension = original.name.split('.').pop()?.toLowerCase() || ''
      const inferredType = MEDIA_TYPE_BY_EXTENSION[extension]
      const validType = inferredType && (!original.type || ACCEPTED_TYPES.has(original.type))
      const file = validType && original.type !== inferredType
        ? new File([original], original.name, { type: inferredType, lastModified: original.lastModified })
        : original
      if (!validType || !ACCEPTED_TYPES.has(file.type)) {
        errors.push(`${file.name}: use PDF, PNG, JPEG, WebP, TIFF, or BMP.`)
      } else if (file.size > maxBytes) {
        errors.push(`${file.name}: exceeds the ${readableBytes(maxBytes)} limit.`)
      } else if (file.size === 0) {
        errors.push(`${file.name}: the file is empty.`)
      } else {
        const key = `${file.name}:${file.size}:${file.lastModified}`
        if (!itemsRef.current.some(item => item.key === key) && !additions.some(item => item.key === key)) {
          additions.push({ key, file })
        }
      }
    }
    if (errors.length) setGlobalError(errors.join('\n'))
    if (additions.length) {
      setItems(current => [...current, ...additions])
      setSelectedKey(current => current || additions[0].key)
    }
  }, [maxBytes])

  const upload = async (item: QueueItem) => {
    const separator = templateKey.lastIndexOf(':')
    const template = { id: templateKey.slice(0, separator), version: Number(templateKey.slice(separator + 1)) }
    setItems(current => current.map(candidate => candidate.key === item.key
      ? { ...candidate, uploading: true, error: undefined }
      : candidate))
    try {
      const job = await cvImportApi.create(item.file, template)
      setItems(current => current.map(candidate => candidate.key === item.key
        ? { ...candidate, uploading: false, job }
        : candidate))
    } catch (error) {
      setItems(current => current.map(candidate => candidate.key === item.key
        ? { ...candidate, uploading: false, error: error instanceof Error ? error.message : String(error) }
        : candidate))
    }
  }

  const uploadReady = () => items.filter(item => !item.job && !item.uploading).forEach(item => void upload(item))

  const loadPreview = async (item: QueueItem) => {
    if (!item.job) return
    setItems(current => current.map(candidate => candidate.key === item.key ? { ...candidate, error: undefined } : candidate))
    try {
      const preview = await cvImportApi.preview(item.job.id)
      setItems(current => current.map(candidate => candidate.key === item.key ? { ...candidate, preview } : candidate))
    } catch (error) {
      setItems(current => current.map(candidate => candidate.key === item.key
        ? { ...candidate, error: error instanceof Error ? error.message : String(error) }
        : candidate))
    }
  }

  const updateJob = async (item: QueueItem, action: 'cancel' | 'retry') => {
    if (!item.job) return
    try {
      const job = await cvImportApi[action](item.job.id)
      setItems(current => current.map(candidate => candidate.key === item.key
        ? { ...candidate, job, preview: undefined, error: undefined }
        : candidate))
    } catch (error) {
      setItems(current => current.map(candidate => candidate.key === item.key
        ? { ...candidate, error: error instanceof Error ? error.message : String(error) }
        : candidate))
    }
  }

  return <div className="cv-import-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="cv-import-dialog" role="dialog" aria-modal="true" aria-labelledby="cv-import-title">
      <header>
        <div>
          <h2 id="cv-import-title">Import CV</h2>
          <p>Drop PDF or image files. The server extracts each CV into editable Markdown and CSS.</p>
        </div>
        <button className="cv-import-close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <div className="cv-import-body">
        <div className="cv-import-source">
          <div
            className={`cv-drop-zone${dragging ? ' dragging' : ''}${globalError ? ' has-error' : ''}`}
            onDragEnter={event => { event.preventDefault(); setDragging(true) }}
            onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
            onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
            onDrop={event => {
              event.preventDefault(); setDragging(false)
              addFiles(Array.from(event.dataTransfer.files))
            }}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={event => (event.key === 'Enter' || event.key === ' ') && fileInput.current?.click()}
          >
            <span className="cv-drop-icon">⇩</span>
            <strong>Drop CV media here</strong>
            <span>PDF or image · up to {readableBytes(maxBytes)} each</span>
            <button type="button">Choose files</button>
            <input ref={fileInput} hidden multiple type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" onChange={event => {
              addFiles(Array.from(event.target.files || [])); event.target.value = ''
            }} />
          </div>

          <div className="cv-import-options">
            <label>Structure template
              <select value={templateKey} onChange={event => setTemplateKey(event.target.value)} disabled={loading || items.some(item => Boolean(item.job))}>
                {!templates.length && <option value="pipeline-default:1">Pipeline default</option>}
                {templates.map(template => <option key={`${template.id}:${template.version}`} value={`${template.id}:${template.version}`}>
                  {template.name} · v{template.version}
                </option>)}
              </select>
            </label>
            <button className="cv-import-primary" disabled={loading || !capabilities?.available || !items.some(item => !item.job && !item.uploading)} onClick={uploadReady}>
              Import {items.filter(item => !item.job).length || ''}
            </button>
          </div>

          {globalError && <div className="cv-import-error" role="alert">{globalError}</div>}

          <div className="cv-import-list">
            {items.map(item => <button key={item.key} className={`cv-import-item${selectedKey === item.key ? ' selected' : ''}`} onClick={() => setSelectedKey(item.key)}>
              <span className="cv-import-file-icon">{item.file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
              <span className="cv-import-file-copy"><strong>{item.file.name}</strong><small>{readableBytes(item.file.size)} · {item.uploading ? 'uploading' : item.job?.stage.replace(/_/g, ' ') || 'ready'}</small></span>
              {item.job && <span className={`cv-import-status ${item.job.state}`}>{item.job.state}</span>}
              {!item.job && !item.uploading && <span className="cv-import-remove" onClick={event => {
                event.stopPropagation(); setItems(current => current.filter(candidate => candidate.key !== item.key))
                if (selectedKey === item.key) setSelectedKey(null)
              }}>×</span>}
              {item.job && !TERMINAL_STATES.has(item.job.state) && <span className="cv-import-progress" style={{ width: `${Math.max(2, item.job.progress)}%` }} />}
            </button>)}
          </div>
        </div>

        <aside className="cv-import-details">
          {!selected && <div className="cv-import-empty">Drop one or more CVs to begin.</div>}
          {selected && <>
            <h3>{selected.file.name}</h3>
            {selected.job && <div className="cv-import-metadata">
              <span>Progress <b>{selected.job.progress}%</b></span>
              <span>Stage <b>{selected.job.stage.replace(/_/g, ' ')}</b></span>
              <span>Attempt <b>{selected.job.attempt}</b></span>
              <span>Source blob <b>{readableBytes(selected.job.source.size)}</b></span>
            </div>}
            {selected.error && <div className="cv-import-error">{selected.error}</div>}
            {selected.job?.error && <div className="cv-import-error"><strong>{selected.job.error.code}</strong><br />{selected.job.error.message}{selected.job.error.reasons?.map(reason => <div key={reason}>• {reason}</div>)}</div>}
            {!!selected.job?.warnings.length && <div className="cv-import-warning"><strong>Warnings</strong>{selected.job.warnings.map(warning => <div key={warning}>• {warning}</div>)}</div>}

            {selected.preview ? <>
              <div className="cv-import-preview-tabs"><span>Markdown + CSS structure</span><span>{selected.preview.markdown.length.toLocaleString()} chars</span></div>
              <pre className="cv-import-preview-text">{selected.preview.markdown.slice(0, 5000)}</pre>
              <button className="cv-import-primary cv-import-apply" onClick={() => onApply(selected.preview!, selected.file.name)}>Use in editor</button>
            </> : selected.job?.state === 'succeeded' ?
              <button className="cv-import-primary cv-import-apply" onClick={() => void loadPreview(selected)}>Preview extracted structure</button> : null}

            {selected.job && !TERMINAL_STATES.has(selected.job.state) && <button className="cv-import-secondary" onClick={() => void updateJob(selected, 'cancel')}>Cancel extraction</button>}
            {(selected.job?.state === 'failed' || selected.job?.state === 'cancelled') && <button className="cv-import-secondary" onClick={() => void updateJob(selected, 'retry')}>Retry extraction</button>}
          </>}
        </aside>
      </div>
    </section>
  </div>
}
