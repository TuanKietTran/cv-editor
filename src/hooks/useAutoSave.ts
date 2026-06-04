import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

const isTauri = () => typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

const LS_MD  = 'cv-editor:autosave:md'
const LS_CSS = 'cv-editor:autosave:css'

export interface AutoSaveState {
  lastSaved: Date | null
  recordSave: () => void
  getWebAutosave: () => { md: string | null; css: string | null }
}

export function useAutoSave(
  content: string,
  cssContent: string,
  projectName: string | null,
  onSaved?: () => void,
): AutoSaveState {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (isTauri()) {
        if (!projectName) return
        try {
          await invoke('save_project', { name: projectName, md: content, css: cssContent })
          setLastSaved(new Date())
          onSavedRef.current?.()
        } catch (err) {
          console.warn('Autosave failed:', err)
        }
      } else {
        try {
          localStorage.setItem(LS_MD, content)
          localStorage.setItem(LS_CSS, cssContent)
          setLastSaved(new Date())
          onSavedRef.current?.()
        } catch (err) {
          console.warn('localStorage autosave failed:', err)
        }
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [content, cssContent, projectName])

  const recordSave = useCallback(() => setLastSaved(new Date()), [])

  const getWebAutosave = useCallback(() => ({
    md:  localStorage.getItem(LS_MD),
    css: localStorage.getItem(LS_CSS),
  }), [])

  return { lastSaved, recordSave, getWebAutosave }
}
