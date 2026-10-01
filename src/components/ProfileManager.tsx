import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ContactKind, ProfileInput, UserProfile } from '../types/profile'
import './ProfileManager.css'

const STORAGE_KEY = 'cv-editor:user-profiles:v1'
const isTauri = () => '__TAURI_INTERNALS__' in window || '__TAURI__' in window
const emptyProfile = (): ProfileInput => ({ fullName: '', headline: '', summary: '', contacts: [], education: [] })
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const clientProfiles = {
  list: (): UserProfile[] => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
    catch { return [] }
  },
  write: (profiles: UserProfile[]) => localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)),
}

export default function ProfileManager() {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProfileInput>(emptyProfile())
  const [error, setError] = useState('')

  const reload = async () => {
    const items = isTauri() ? await invoke<UserProfile[]>('list_profiles') : clientProfiles.list()
    setProfiles(items.sort((a, b) => b.updatedAt - a.updatedAt))
  }
  useEffect(() => { void reload() }, [])

  const startCreate = () => { setEditingId(''); setDraft(emptyProfile()); setError('') }
  const startEdit = (profile: UserProfile) => {
    setEditingId(profile.id)
    setDraft({ fullName: profile.fullName, headline: profile.headline, summary: profile.summary, contacts: profile.contacts, education: profile.education })
    setError('')
  }
  const save = async () => {
    if (!draft.fullName.trim()) { setError('Full name is required.'); return }
    if (draft.contacts.some(contact => !contact.value.trim())) { setError('Every contact needs a value.'); return }
    if (draft.education.some(item => !item.institution.trim())) { setError('Every education entry needs an institution.'); return }
    try {
      if (isTauri()) {
        if (editingId) await invoke('update_profile', { id: editingId, profile: draft })
        else await invoke('create_profile', { profile: draft })
      } else {
        const items = clientProfiles.list()
        const now = Date.now()
        if (editingId) {
          const index = items.findIndex(item => item.id === editingId)
          if (index >= 0) items[index] = { ...items[index], ...draft, updatedAt: now }
        } else items.push({ ...draft, id: uid('profile'), createdAt: now, updatedAt: now })
        clientProfiles.write(items)
      }
      setEditingId(null); setDraft(emptyProfile()); await reload()
    } catch (reason) { setError(String(reason)) }
  }
  const remove = async (profile: UserProfile) => {
    if (!confirm(`Delete ${profile.fullName}'s profile?`)) return
    if (isTauri()) await invoke('delete_profile', { id: profile.id })
    else clientProfiles.write(clientProfiles.list().filter(item => item.id !== profile.id))
    if (editingId === profile.id) setEditingId(null)
    await reload()
  }
  const addContact = () => setDraft(value => ({ ...value, contacts: [...value.contacts, { id: uid('contact'), kind: 'email', label: '', value: '' }] }))
  const addEducation = () => setDraft(value => ({ ...value, education: [...value.education, { id: uid('education'), institution: '', degree: '', fieldOfStudy: '', startDate: '', endDate: '' }] }))

  return <section className="profiles-dialog profiles-page" aria-labelledby="profiles-title">
        <header><div><h2 id="profiles-title">User profiles</h2><p>Education and contact information for your CVs.</p></div></header>
        <div className="profiles-body">
          <aside className="profiles-list">
            <button className="profiles-new" onClick={startCreate}>＋ New profile</button>
            {profiles.length === 0 && <p className="profiles-empty">No profiles yet.</p>}
            {profiles.map(profile => <article className={`profile-card${editingId === profile.id ? ' active' : ''}`} key={profile.id} onClick={() => startEdit(profile)}>
              <div className="profile-card-title"><strong>{profile.fullName}</strong><button aria-label={`Delete ${profile.fullName}`} onClick={event => { event.stopPropagation(); void remove(profile) }}>×</button></div>
              {profile.headline && <span>{profile.headline}</span>}
              <ul>{profile.contacts.map(contact => <li key={contact.id}><b>{contact.kind}</b> {contact.value}</li>)}</ul>
            </article>)}
          </aside>
          <main className="profile-form">
            {editingId === null ? <div className="profile-form-placeholder">Select a profile or create a new one.</div> : <>
              <label>Full name<input value={draft.fullName} maxLength={120} onChange={event => setDraft({ ...draft, fullName: event.target.value })} /></label>
              <label>Headline<input value={draft.headline} onChange={event => setDraft({ ...draft, headline: event.target.value })} placeholder="Product designer, software engineer…" /></label>
              <label>Summary<textarea value={draft.summary} rows={3} onChange={event => setDraft({ ...draft, summary: event.target.value })} /></label>
              <div className="profile-section-heading"><h3>Contact information</h3><button onClick={addContact}>＋ Add</button></div>
              {draft.contacts.map((contact, index) => <div className="profile-row contact-row" key={contact.id}>
                <select value={contact.kind} onChange={event => { const contacts = [...draft.contacts]; contacts[index] = { ...contact, kind: event.target.value as ContactKind }; setDraft({ ...draft, contacts }) }}><option value="phone">Phone</option><option value="email">Email</option><option value="address">Address</option><option value="social">Social</option></select>
                <input aria-label="Contact label" placeholder="Label" value={contact.label} onChange={event => { const contacts = [...draft.contacts]; contacts[index] = { ...contact, label: event.target.value }; setDraft({ ...draft, contacts }) }} />
                <input aria-label="Contact value" placeholder="Value" value={contact.value} onChange={event => { const contacts = [...draft.contacts]; contacts[index] = { ...contact, value: event.target.value }; setDraft({ ...draft, contacts }) }} />
                <button aria-label="Remove contact" onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, i) => i !== index) })}>×</button>
              </div>)}
              <div className="profile-section-heading"><h3>Education</h3><button onClick={addEducation}>＋ Add</button></div>
              {draft.education.map((item, index) => <div className="education-row" key={item.id}>
                {(['institution', 'degree', 'fieldOfStudy', 'startDate', 'endDate'] as const).map(field => <input key={field} aria-label={field} placeholder={({ institution: 'Institution', degree: 'Degree', fieldOfStudy: 'Field of study', startDate: 'Start date', endDate: 'End date' })[field]} value={item[field]} onChange={event => { const education = [...draft.education]; education[index] = { ...item, [field]: event.target.value }; setDraft({ ...draft, education }) }} />)}
                <button aria-label="Remove education" onClick={() => setDraft({ ...draft, education: draft.education.filter((_, i) => i !== index) })}>×</button>
              </div>)}
              {error && <p className="profile-error">{error}</p>}
              <footer><button className="toolbar-btn" onClick={() => setEditingId(null)}>Cancel</button><button className="toolbar-btn profile-save" onClick={() => void save()}>Save profile</button></footer>
            </>}
          </main>
        </div>
  </section>
}
