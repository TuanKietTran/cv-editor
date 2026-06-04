import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function useFileWatch(path: string | null, onChanged: (content: string) => void) {
  const callbackRef = useRef(onChanged)
  callbackRef.current = onChanged

  useEffect(() => {
    if (!path) return
    let mounted = true
    let lastContent: string | null = null
    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const content = await invoke<string>('read_file', { path })
        if (lastContent !== null && content !== lastContent) {
          callbackRef.current(content)
        }
        lastContent = content
      } catch {
        // file may have been deleted or is temporarily inaccessible
      }
      if (mounted) timeoutId = setTimeout(poll, 2000)
    }

    poll()
    return () => {
      mounted = false
      clearTimeout(timeoutId)
    }
  }, [path])
}
