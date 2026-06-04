import { useEffect, useMemo, useRef } from 'react'
import { render } from '../lib/markdown'
import './CvPreview.css'

interface Props {
  content: string
  css: string
}

export default function CvPreview({ content, css }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const srcDoc = useMemo(() => {
    const html = render(content)
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${css}</style>
</head>
<body>
${html}
</body>
</html>`
  }, [content, css])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(srcDoc)
    doc.close()
  }, [srcDoc])

  return (
    <iframe
      ref={iframeRef}
      className="cv-preview-iframe"
      title="CV Preview"
    />
  )
}
