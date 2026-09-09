import html2canvas from 'html2canvas'

export type ImageFormat = 'png' | 'jpeg'

export async function renderPreviewImage(format: ImageFormat): Promise<string> {
  const iframe = document.querySelector<HTMLIFrameElement>('.cv-preview-iframe')
  const preview = iframe?.contentDocument?.documentElement
  if (!preview) throw new Error('CV preview is not ready')

  await iframe.contentDocument?.fonts?.ready
  const canvas = await html2canvas(preview, {
    width: preview.scrollWidth,
    height: preview.scrollHeight,
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })
  return canvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.95)
}
