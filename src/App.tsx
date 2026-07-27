import { Link, Route, Routes } from 'react-router-dom'
import OfflineIndicator from './components/OfflineIndicator'
import InstallButton from './components/InstallButton'
import BottomNav from './components/BottomNav'
import Fihrist from './pages/Fihrist'
import Recite from './pages/Recite'
import EditNoha from './pages/EditNoha'
import ManageOccasions from './pages/ManageOccasions'
import Backup from './pages/Backup'
import More from './pages/More'

const BrandMark = (
  <span className="brand-mark" aria-hidden>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#f2e2b3" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.4" fill="#f2e2b3" />
    </svg>
  </span>
)

function Masthead() {
  return (
    <header className="masthead no-print">
      <div className="masthead-inner">
        <div className="brand">
          <Link to="/" aria-label="Noha Directory — home">
            {BrandMark}
            <span className="brand-en">Noha&nbsp;Directory</span>
            <span className="brand-ur">فہرستِ نوحہ</span>
          </Link>
        </div>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <div className="app">
      <Masthead />
      <OfflineIndicator />
      <main className="content">
        <Routes>
          <Route path="/" element={<Fihrist />} />
          <Route path="/noha/:id" element={<Recite />} />
          <Route path="/noha/:id/edit" element={<EditNoha />} />
          <Route path="/add" element={<EditNoha />} />
          <Route path="/occasions" element={<ManageOccasions />} />
          <Route path="/backup" element={<Backup />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <InstallButton />
      <BottomNav />
    </div>
  )
}

function NotFound() {
  return (
    <div className="state">
      <div className="emblem">۞</div>
      <h2>Page not found</h2>
      <Link className="btn mt" to="/">
        Back to fihrist
      </Link>
    </div>
  )
}
