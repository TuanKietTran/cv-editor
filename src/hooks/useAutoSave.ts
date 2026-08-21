import { useCallback, useEffect, useRef, useState } from 'react'
import * as backend from '../lib/backend'

export interface AutoSaveState {
  lastSaved: Date | null
  recordSave: () => void
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
    if (!projectName) return
    const timer = setTimeout(async () => {
      try {
        await backend.saveProject(projectName, content, cssContent)
        setLastSaved(new Date())
        onSavedRef.current?.()
      } catch (err) {
        console.warn('Autosave failed:', err)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [content, cssContent, projectName])

  const recordSave = useCallback(() => setLastSaved(new Date()), [])

  return { lastSaved, recordSave }
}
