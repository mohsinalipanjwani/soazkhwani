import { useNavigate } from 'react-router-dom'
import { clearEditorKey, ensureEditorKey, useEditor } from '../editor'
import { useOnline } from '../hooks'

const Chevron = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-3)' }}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

function Row({
  icon,
  label,
  sub,
  onClick,
  danger,
}: {
  icon: string
  label: string
  sub?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button className="list-row" onClick={onClick}>
      <span className="lr-icon" aria-hidden style={danger ? { color: 'var(--danger)' } : undefined}>
        {icon}
      </span>
      <span className="lr-label" style={danger ? { color: 'var(--danger)' } : undefined}>
        {label}
        {sub && <div className="lr-sub">{sub}</div>}
      </span>
      {Chevron}
    </button>
  )
}

export default function More() {
  const { isEditor } = useEditor()
  const online = useOnline()
  const navigate = useNavigate()

  return (
    <div>
      <h1 className="page-title">More</h1>

      {isEditor ? (
        <>
          <div className="section-card">
            <div className="section-title">Editor tools</div>
            <Row icon="✚" label="Add a noha" sub="Create a new entry" onClick={() => navigate('/add')} />
            <Row icon="🗂" label="Manage occasions" sub="Add, rename, reorder" onClick={() => navigate('/occasions')} />
            <Row icon="⇩" label="Backup & import" sub="Export or restore JSON" onClick={() => navigate('/backup')} />
          </div>
          <div className="section-card">
            <div className="section-title">Editor session</div>
            <Row
              icon="🔒"
              label="Lock editor mode"
              sub="Stops showing edit controls on this device"
              onClick={() => clearEditorKey()}
              danger
            />
          </div>
        </>
      ) : (
        <div className="section-card">
          <div className="section-title">Editors</div>
          <Row
            icon="🔑"
            label="Unlock editor mode"
            sub="Enter the shared passcode to add or edit nohas"
            onClick={() => {
              if (ensureEditorKey()) navigate('/more')
            }}
          />
        </div>
      )}

      <div className="section-card">
        <div className="section-title">App</div>
        <div className="list-row" style={{ cursor: 'default' }}>
          <span className="lr-icon" aria-hidden>
            {online ? '🟢' : '🟠'}
          </span>
          <span className="lr-label">
            {online ? 'Online' : 'Offline'}
            <div className="lr-sub">
              {online
                ? 'Browsing and editing available.'
                : 'Browsing works from cache; editing needs a connection.'}
            </div>
          </span>
        </div>
        <div className="list-row" style={{ cursor: 'default' }}>
          <span className="lr-icon" aria-hidden>
            ⇩
          </span>
          <span className="lr-label">
            Install the app
            <div className="lr-sub">
              Use the “Install app” button, or your browser’s Add to Home Screen.
            </div>
          </span>
        </div>
      </div>

      <p className="center" style={{ color: 'var(--ink-3)', fontSize: '0.82rem' }}>
        یا حسین ع · Noha Directory
      </p>
    </div>
  )
}
