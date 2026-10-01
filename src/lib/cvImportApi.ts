import type {
  CvImportJob,
  CvImportPreview,
  CvPipelineCapabilities,
  CvTemplate,
} from '../types/cvImport'

const configuredBase = (import.meta.env.VITE_CV_SERVER_URL as string | undefined)?.trim()
const API_BASE = (configuredBase || '/cv-server').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('Cannot reach the CV server. Check VITE_CV_SERVER_URL and that the server is running.')
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      statusMessage?: string
      message?: string
      data?: { message?: string }
    } | null
    if (response.status === 401) {
      throw new Error('Sign in to the CV server before importing a CV.')
    }
    throw new Error(payload?.statusMessage || payload?.data?.message || payload?.message || `CV server returned ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const cvImportApi = {
  capabilities: () => request<CvPipelineCapabilities>('/api/cv-capabilities'),

  templates: async () => {
    const result = await request<{ templates: CvTemplate[] }>('/api/public/templates')
    return result.templates
  },

  create: (file: File, template: { id: string; version: number }) => {
    const body = new FormData()
    body.append('file', file, file.name)
    body.append('templateId', template.id)
    body.append('templateVersion', String(template.version))
    return request<CvImportJob>('/api/cv-imports', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': `${file.name}:${file.size}:${file.lastModified}` },
    })
  },

  get: (id: string) => request<CvImportJob>(`/api/cv-imports/${encodeURIComponent(id)}`),
  preview: (id: string) => request<CvImportPreview>(`/api/cv-imports/${encodeURIComponent(id)}/preview`),
  cancel: (id: string) => request<CvImportJob>(`/api/cv-imports/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retry: (id: string) => request<CvImportJob>(`/api/cv-imports/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
}
