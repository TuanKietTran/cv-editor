export type CvImportState =
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface CvArtifact {
  id: string
  filename?: string
  kind?: 'concept' | 'markdown' | 'css' | 'html' | 'raw-text'
  mediaType: string
  size: number
  checksum: string
  createdAt: string
  expiresAt: string
}

export interface CvImportJob {
  id: string
  state: CvImportState
  progress: number
  stage: string
  source: CvArtifact & { filename: string }
  artifacts: CvArtifact[]
  warnings: string[]
  error?: { code: string; message: string; reasons?: string[] }
  cancelRequested: boolean
  attempt: number
  createdAt: string
  updatedAt: string
}

export interface CvImportPreview {
  importId: string
  state: CvImportState
  concept: unknown
  markdown: string
  css: string
  warnings: string[]
  confidence?: number
}

export interface CvPipelineCapabilities {
  available: boolean
  formats: string[]
  maxUploadBytes: number
  ocr: boolean
  renderer: string
  degradedReason?: string
}

export interface CvTemplate {
  id: string
  version: number
  name: string
  tags: string[]
  capabilities: {
    pageFormats: string[]
    supportsPhoto: boolean
    atsFriendly: boolean
  }
}
