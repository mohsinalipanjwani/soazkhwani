import { useEffect, useState } from 'react'
import { createOccasion, deleteOccasion, listOccasions, updateOccasion } from '../api'
import type { Occasion } from '../types'
import { ensureEditorKey, useEditor } from '../editor'
import { useOnline } from '../hooks'
import { ErrorBanner, Loading } from '../components/states'

export default function ManageOccasions() {
  const { isEditor } = useEditor()
  const online = useOnline()
  const [occasions, setOccasions] = useState<Occasion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isEditor) ensureEditorKey()
  }, [isEditor])

  const reload = () =>
    listOccasions()
      .then((o) => setOccasions([...o].sort((a, b) => a.sort_order - b.sort_order)))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // Swap their sort_order values.
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
    if (
      !window.confirm(
        `Delete "${o.name}"? Nohas in it are kept, but become unfiled (no occasion).`,
      )
    )
      return
    try {
      await deleteOccasion(o.id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (loading) return <Loading label="Loading occasions…" />

  return (
    <div>
      <h1>Manage occasions</h1>
      <p className="hint" style={{ color: 'var(--ink-soft)' }}>
        Add new date ranges, rename, reorder, or remove them. The order here is the order the
        fihrist uses.
      </p>

      {!online && <div className="banner info">You're offline — changes need a connection.</div>}
      {error && <ErrorBanner message={error} />}

      <div className="occ-list mt">
        {occasions.map((o, i) => (
          <div className="occ-row" key={o.id}>
            <div className="order-btns">
              <button aria-label="Move up" onClick={() => moveRow(i, -1)} disabled={i === 0}>
                ▲
              </button>
              <button
                aria-label="Move down"
                onClick={() => moveRow(i, 1)}
                disabled={i === occasions.length - 1}
              >
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
          placeholder="New occasion name, e.g. “9–10 Rabi ul Awwal”"
          aria-label="New occasion name"
        />
        <button className="btn" onClick={add} disabled={busy || !newName.trim()}>
          + Add
        </button>
      </div>
    </div>
  )
}
