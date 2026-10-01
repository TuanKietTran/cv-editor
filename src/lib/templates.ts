import cvMarkdown from '../../templates/cv.md?raw'
import cvCss from '../../templates/cv.css?raw'

export interface EditorTemplate {
  markdown: string
  css: string
}

/** Browser fallback and the baseline template bundled with the desktop app. */
export const bundledTemplates: Record<string, EditorTemplate> = {
  cv: { markdown: cvMarkdown, css: cvCss },
}

export const bundledTemplateNames = Object.keys(bundledTemplates)
