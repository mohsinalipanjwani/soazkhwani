import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

/* App-style bottom tab bar. Home · Search · Occasions · More. */

const IconHome = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </svg>
)
const IconSearch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
const IconOccasions = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
  </svg>
)
const IconMore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)

interface Tab {
  key: string
  label: string
  icon: ReactNode
  match: (path: string) => boolean
  onPress: (nav: ReturnType<typeof useNavigate>) => void
}

const TABS: Tab[] = [
  {
    key: 'home',
    label: 'Home',
    icon: IconHome,
    match: (p) => p === '/' || p.startsWith('/noha'),
    onPress: (nav) => nav('/'),
  },
  {
    key: 'search',
    label: 'Search',
    icon: IconSearch,
    match: () => false, // search shares the home route; highlight is driven by focus intent
    onPress: (nav) => nav('/', { state: { focusSearch: Date.now() } }),
  },
  {
    key: 'occasions',
    label: 'Occasions',
    icon: IconOccasions,
    match: (p) => p.startsWith('/occasions'),
    onPress: (nav) => nav('/occasions'),
  },
  {
    key: 'more',
    label: 'More',
    icon: IconMore,
    match: (p) => p.startsWith('/more') || p.startsWith('/add') || p.startsWith('/backup'),
    onPress: (nav) => nav('/more'),
  },
]

export default function BottomNav() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className="tabbar no-print" aria-label="Primary">
      <div className="tabbar-inner">
        {TABS.map((t) => {
          const active = t.match(pathname)
          return (
            <button
              key={t.key}
              className={`tab ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => t.onPress(nav)}
            >
              {t.icon}
              <span>{t.label}</span>
              <span className="tab-dot" />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
