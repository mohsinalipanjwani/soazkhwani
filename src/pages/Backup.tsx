import { useEffect, useRef, useState } from 'react'
import { exportAll, importData } from '../api'
import { ensureEditorKey, useEditor } from '../editor'
import { useOnline } from '../hooks'
import { ErrorBanner } from '../components/states'

export default function Backup() {
  const { isEditor } = useEditor()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditor) ensureEditorKey()
  }, [isEditor])

  async function download() {
    setError(null)
    setBusy(true)
    try {
      const data = await exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `noha-backup-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Backup downloaded.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setMessage(null)

    if (!online) {
      setError("You're offline — importing needs a connection.")
      return
    }
    if (
      mode === 'replace' &&
      !window.confirm('Replace mode wipes ALL current data before importing. Continue?')
    )
      return

    setBusy(true)
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const res = await importData(payload, mode)
      setMessage(
        `Imported: ${res.nohasAdded} nohas, ${res.occasionsAdded} occasions, ${res.themesAdded} themes (${res.mode} mode).`,
      )
    } catch (e) {
      setError(
        e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1>Backup &amp; import</h1>

      {!online && <div className="banner info">You're offline — importing needs a connection.</div>}
      {error && <ErrorBanner message={error} />}
      {message && <div className="banner info">{message}</div>}

      <div className="form-grid mt">
        <div className="field">
          <label>Download backup</label>
          <span className="hint">
            Saves the whole directory (occasions, themes, nohas and image references) as a JSON
            file.
          </span>
          <div>
            <button className="btn" onClick={download} disabled={busy}>
              ⇩ Download JSON backup
            </button>
          </div>
        </div>

        <div className="field">
          <label>Import</label>
          <span className="hint">
            Accepts a backup produced here, or the prototype's format (a plain array of noha
            objects with a <code>category</code> field). Occasions and themes are created as
            needed.
          </span>
          <div className="chips" style={{ margin: '0.4rem 0' }}>
            <button
              className={`chip ${mode === 'merge' ? 'active' : ''}`}
              onClick={() => setMode('merge')}
            >
              Merge (add to existing)
            </button>
            <button
              className={`chip ${mode === 'replace' ? 'active' : ''}`}
              onClick={() => setMode('replace')}
            >
              Replace (wipe first)
            </button>
          </div>
          <div>
            <button
              className="btn gold"
              onClick={() => fileRef.current?.click()}
              disabled={busy || !online}
            >
              ⇧ Choose JSON file to import
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
          </div>
        </div>
      </div>
    </div>
  )
}
