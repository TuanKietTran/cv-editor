export type ContactKind = 'phone' | 'email' | 'address' | 'social'

export interface ContactInfo {
  id: string
  kind: ContactKind
  label: string
  value: string
}

export interface Education {
  id: string
  institution: string
  degree: string
  fieldOfStudy: string
  startDate: string
  endDate: string
}

export interface UserProfile {
  id: string
  fullName: string
  headline: string
  summary: string
  contacts: ContactInfo[]
  education: Education[]
  createdAt: number
  updatedAt: number
}

export type ProfileInput = Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>
