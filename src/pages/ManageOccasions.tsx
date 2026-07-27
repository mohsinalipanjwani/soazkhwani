import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createOccasion, deleteOccasion, listNohas, listOccasions, updateOccasion } from '../api'
import type { Noha, Occasion } from '../types'
import { useEditor } from '../editor'
import { useOnline } from '../hooks'
import { ErrorBanner, Loading } from '../components/states'

export default function ManageOccasions() {
  const { isEditor } = useEditor()
  const online = useOnline()
  const navigate = useNavigate()
  const [occasions, setOccasions] = useState<Occasion[]>([])
  const [nohas, setNohas] = useState<Noha[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () =>
    Promise.all([listOccasions(), listNohas()])
      .then(([o, n]) => {
        setOccasions([...o].sort((a, b) => a.sort_order - b.sort_order))
        setNohas(n)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // noha count per occasion (for browse labels)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of nohas) if (n.occasion_id) m.set(n.occasion_id, (m.get(n.occasion_id) ?? 0) + 1)
    return m
  }, [nohas])
  const unfiled = useMemo(() => nohas.filter((n) => !n.occasion_id).length, [nohas])

  const guardOffline = (): boolean => {
    if (!online) {
      setError("You're offline — changes need a connection.")
      return true
    }
    return false
  }

  async function add() {
    if (guardOffline()) return
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      await createOccasion(name)
      setNewName('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function rename(o: Occasion, name: string) {
    if (name.trim() === o.name || !name.trim()) return
    if (guardOffline()) return
    try {
      await updateOccasion(o.id, { name: name.trim() })
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function moveRow(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= occasions.length) return
    if (guardOffline()) return
    const a = occasions[index]
    const b = occasions[j]
    try {
      await Promise.all([
        updateOccasion(a.id, { sort_order: b.sort_order }),
        updateOccasion(b.id, { sort_order: a.sort_order }),
      ])
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  async function remove(o: Occasion) {
    if (guardOffline()) return
    if (!window.confirm(`Delete "${o.name}"? Nohas in it are kept, but become unfiled.`)) return
    try {
      await deleteOccasion(o.id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (loading) return <Loading label="Loading occasions…" />

  const Chevron = (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-3)' }}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )

  return (
    <div>
      <h1 className="page-title">Occasions</h1>
      <p className="hint" style={{ color: 'var(--ink-2)', marginTop: '-0.4rem', marginBottom: '0.9rem' }}>
        {isEditor
          ? 'Tap a name to rename; use ▲▼ to reorder. This is the order the fihrist uses.'
          : 'Browse nohas by occasion.'}
      </p>

      {!online && isEditor && <div className="banner info">You're offline — changes need a connection.</div>}
      {error && <ErrorBanner message={error} />}

      {isEditor ? (
        <>
          <div className="occ-list">
            {occasions.map((o, i) => (
              <div className="occ-row" key={o.id}>
                <div className="order-btns">
                  <button aria-label="Move up" onClick={() => moveRow(i, -1)} disabled={i === 0}>
                    ▲
                  </button>
                  <button aria-label="Move down" onClick={() => moveRow(i, 1)} disabled={i === occasions.length - 1}>
                    ▼
                  </button>
                </div>
                <input
                  defaultValue={o.name}
                  onBlur={(e) => rename(o, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  aria-label={`Occasion name: ${o.name}`}
                />
                <span className="group-count">{counts.get(o.id) ?? 0}</span>
                <button className="btn danger small" onClick={() => remove(o)}>
                  Delete
                </button>
              </div>
            ))}
            {occasions.length === 0 && <p>No occasions yet — add one below.</p>}
          </div>

          <div className="occ-row mt" style={{ borderStyle: 'dashed' }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add()
              }}
              placeholder="New occasion, e.g. “9–10 Rabi ul Awwal”"
              aria-label="New occasion name"
            />
            <button className="btn" onClick={add} disabled={busy || !newName.trim()}>
              + Add
            </button>
          </div>
        </>
      ) : (
        <div className="occ-list">
          {occasions.map((o) => (
            <div className="occ-row" key={o.id}>
              <button className="occ-browse" onClick={() => navigate(`/?occasion=${o.id}`)}>
                <span>{o.name}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="group-count">{counts.get(o.id) ?? 0}</span>
                  {Chevron}
                </span>
              </button>
            </div>
          ))}
          {unfiled > 0 && (
            <div className="occ-row">
              <button className="occ-browse" onClick={() => navigate('/')}>
                <span>Unfiled</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="group-count">{unfiled}</span>
                  {Chevron}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
