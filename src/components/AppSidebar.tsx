import './AppSidebar.css'

export type AppView = 'editor' | 'profiles'

interface Props {
  activeView: AppView
  onChange: (view: AppView) => void
}

export default function AppSidebar({ activeView, onChange }: Props) {
  return <nav className="app-sidebar" aria-label="Application navigation">
    <button className={activeView === 'editor' ? 'active' : ''} onClick={() => onChange('editor')} aria-label="CV editor" title="CV editor">▤</button>
    <button className={activeView === 'profiles' ? 'active' : ''} onClick={() => onChange('profiles')} aria-label="Manage profiles" title="Profiles">♙</button>
  </nav>
}
