import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { bundledTemplateNames } from '../lib/templates'
import './TemplateMenu.css'

interface Props {
  onSelect: (name: string) => void
}

export default function TemplateMenu({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<string[]>(bundledTemplateNames)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    invoke<string[]>('list_templates')
      .then(names => setTemplates(Array.from(new Set([...bundledTemplateNames, ...names]))))
      // Browser builds cannot invoke Rust; the bundled fallback remains available.
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (templates.length === 0) return null

  return (
    <div ref={ref} className="template-menu">
      <button
        className="toolbar-btn"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        Templates
        <span className="template-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="template-dropdown" role="listbox">
          {templates.map(name => (
            <button
              key={name}
              role="option"
              className="template-item"
              onClick={() => { onSelect(name); setOpen(false) }}
            >
              <span className="template-item-icon">⎘</span>
              {name}
              <span className="template-item-ext">.md + .css</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
