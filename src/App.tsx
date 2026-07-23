import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { clearEditorKey, ensureEditorKey, useEditor } from './editor'
import OfflineIndicator from './components/OfflineIndicator'
import InstallButton from './components/InstallButton'
import Fihrist from './pages/Fihrist'
import Recite from './pages/Recite'
import EditNoha from './pages/EditNoha'
import ManageOccasions from './pages/ManageOccasions'
import Backup from './pages/Backup'

function Masthead() {
  const { isEditor } = useEditor()
  const navigate = useNavigate()

  return (
    <header className="masthead no-print">
      <div className="masthead-inner">
        <div className="brand">
          <Link to="/" aria-label="Noha Directory — home">
            <span className="brand-en">Noha&nbsp;Directory</span>{' '}
            <span className="brand-ur">فہرستِ نوحہ</span>
          </Link>
        </div>
        <nav>
          {isEditor ? (
            <>
              <Link className="btn ghost small" to="/add">
                + Add
              </Link>
              <Link className="btn ghost small" to="/occasions">
                Occasions
              </Link>
              <Link className="btn ghost small" to="/backup">
                Backup
              </Link>
              <button className="btn ghost small" onClick={() => clearEditorKey()}>
                Lock
              </button>
            </>
          ) : (
            <button
              className="btn ghost small"
              onClick={() => {
                if (ensureEditorKey()) navigate('/add')
              }}
            >
              Editor
            </button>
          )}
        </nav>
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer no-print">
        یا حسین ع — Noha Directory
      </footer>
      <InstallButton />
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
