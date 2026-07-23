import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  createNoha,
  deleteImage,
  deleteNoha,
  getNoha,
  listOccasions,
  listThemes,
  updateImageOrder,
  updateNoha,
  uploadImage,
} from '../api'
import type { NohaImage, NohaInput, Occasion, Theme } from '../types'
import { ensureEditorKey, useEditor } from '../editor'
import { useOnline } from '../hooks'
import { ErrorBanner, Loading } from '../components/states'

interface Fields {
  title_ur: string
  title_ro: string
  occasion_id: string
  poet: string
  reciter: string
  soz: string
  party: string
  lyrics_ur: string
  lyrics_ro: string
  source: string
}

const EMPTY: Fields = {
  title_ur: '',
  title_ro: '',
  occasion_id: '',
  poet: '',
  reciter: '',
  soz: '',
  party: '',
  lyrics_ur: '',
  lyrics_ro: '',
  source: '',
}

// Unified image item: either already on the server, or a local file pending upload.
type ImgItem =
  | { kind: 'server'; key: string; img: NohaImage }
  | { kind: 'pending'; key: string; file: File; url: string }

export default function EditNoha() {
  const { id } = useParams<{ id: string }>()
  const editing = !!id
  const navigate = useNavigate()
  const { isEditor } = useEditor()
  const online = useOnline()

  const [fields, setFields] = useState<Fields>(EMPTY)
  const [occasions, setOccasions] = useState<Occasion[]>([])
  const [allThemes, setAllThemes] = useState<Theme[]>([])
  const [selectedThemes, setSelectedThemes] = useState<string[]>([])
  const [themeInput, setThemeInput] = useState('')
  const [images, setImages] = useState<ImgItem[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Require an editor passcode to reach this screen.
  useEffect(() => {
    if (!isEditor) ensureEditorKey()
  }, [isEditor])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [occ, th] = await Promise.all([listOccasions(), listThemes()])
        if (cancelled) return
        setOccasions(occ)
        setAllThemes(th)
        if (editing && id) {
          const n = await getNoha(id)
          if (cancelled) return
          setFields({
            title_ur: n.title_ur ?? '',
            title_ro: n.title_ro ?? '',
            occasion_id: n.occasion_id ?? '',
            poet: n.poet ?? '',
            reciter: n.reciter ?? '',
            soz: n.soz ?? '',
            party: n.party ?? '',
            lyrics_ur: n.lyrics_ur ?? '',
            lyrics_ro: n.lyrics_ro ?? '',
            source: n.source ?? '',
          })
          setSelectedThemes(n.themes.map((t) => t.name))
          setImages(
            n.images
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((img) => ({ kind: 'server' as const, key: img.id, img })),
          )
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [editing, id])

  // Clean up object URLs for pending files on unmount.
  useEffect(() => {
    return () => {
      images.forEach((i) => i.kind === 'pending' && URL.revokeObjectURL(i.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }))

  // ---- Theme tag editing ----
  const suggestions = useMemo(
    () => allThemes.filter((t) => !selectedThemes.some((s) => s.toLowerCase() === t.name.toLowerCase())),
    [allThemes, selectedThemes],
  )
  const addTheme = (name: string) => {
    const n = name.trim()
    if (!n) return
    if (!selectedThemes.some((s) => s.toLowerCase() === n.toLowerCase())) {
      setSelectedThemes((prev) => [...prev, n])
    }
    setThemeInput('')
  }
  const removeTheme = (name: string) =>
    setSelectedThemes((prev) => prev.filter((s) => s !== name))

  // ---- Image handling ----
  const addFiles = (files: FileList | File[]) => {
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/'))
    setImages((prev) => [
      ...prev,
      ...picked.map((file) => ({
        kind: 'pending' as const,
        key: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ])
  }
  const removeImage = async (item: ImgItem) => {
    if (item.kind === 'pending') {
      URL.revokeObjectURL(item.url)
      setImages((prev) => prev.filter((i) => i.key !== item.key))
    } else {
      if (!online) return
      try {
        await deleteImage(item.img.id)
        setImages((prev) => prev.filter((i) => i.key !== item.key))
      } catch (e) {
        setError((e as Error).message)
      }
    }
  }
  const move = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev]
      const j = index + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  // ---- Save ----
  async function save() {
    setError(null)
    if (!online) {
      setError("You're offline — changes need a connection.")
      return
    }
    if (!fields.title_ur && !fields.title_ro) {
      setError('Please give the noha a title (Urdu or Roman).')
      return
    }
    setSaving(true)
    try {
      const payload: NohaInput = {
        occasion_id: fields.occasion_id || null,
        title_ur: fields.title_ur || null,
        title_ro: fields.title_ro || null,
        poet: fields.poet || null,
        reciter: fields.reciter || null,
        soz: fields.soz || null,
        party: fields.party || null,
        lyrics_ur: fields.lyrics_ur || null,
        lyrics_ro: fields.lyrics_ro || null,
        source: fields.source || null,
        themes: selectedThemes,
      }
      const saved = editing && id ? await updateNoha(id, payload) : await createNoha(payload)

      // Upload any pending files in their listed order, building the final id list.
      const orderedIds: string[] = []
      for (const item of images) {
        if (item.kind === 'server') {
          orderedIds.push(item.img.id)
        } else {
          const uploaded = await uploadImage(saved.id, item.file)
          orderedIds.push(uploaded.id)
        }
      }
      // Persist the final ordering.
      await Promise.all(orderedIds.map((imgId, i) => updateImageOrder(imgId, i)))

      navigate(`/noha/${saved.id}`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!id) return
    if (!online) {
      setError("You're offline — changes need a connection.")
      return
    }
    if (!window.confirm('Delete this noha? This also removes its images. This cannot be undone.'))
      return
    setSaving(true)
    try {
      await deleteNoha(id)
      navigate('/')
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  if (loading) return <Loading label="Loading editor…" />

  return (
    <div>
      <h1>{editing ? 'Edit noha' : 'Add noha'}</h1>

      {!online && (
        <div className="banner info">
          You're offline — you can review this form, but saving needs a connection.
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="title_ur">Urdu title (matla)</label>
          <input
            id="title_ur"
            className="ur"
            value={fields.title_ur}
            onChange={set('title_ur')}
            placeholder="مطلع / پہلی سطر"
            dir="rtl"
          />
        </div>

        <div className="field">
          <label htmlFor="title_ro">Roman title</label>
          <input id="title_ro" value={fields.title_ro} onChange={set('title_ro')} />
        </div>

        <div className="row-2">
          <div className="field">
            <label htmlFor="occasion">Occasion</label>
            <select id="occasion" value={fields.occasion_id} onChange={set('occasion_id')}>
              <option value="">— none —</option>
              {[...occasions]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="source">Source</label>
            <input id="source" value={fields.source} onChange={set('source')} placeholder="Book / page / website" />
          </div>
        </div>

        <div className="row-2">
          <div className="field">
            <label htmlFor="poet">Poet (shayar)</label>
            <input id="poet" value={fields.poet} onChange={set('poet')} />
          </div>
          <div className="field">
            <label htmlFor="reciter">Reciter (noha khuwan)</label>
            <input id="reciter" value={fields.reciter} onChange={set('reciter')} />
          </div>
        </div>

        <div className="row-2">
          <div className="field">
            <label htmlFor="soz">Soz (tune)</label>
            <input id="soz" value={fields.soz} onChange={set('soz')} />
          </div>
          <div className="field">
            <label htmlFor="party">Party</label>
            <input id="party" value={fields.party} onChange={set('party')} />
          </div>
        </div>

        {/* Themes */}
        <div className="field theme-editor">
          <label>Themes</label>
          <div className="selected">
            {selectedThemes.map((t) => (
              <span className="theme-tag" key={t}>
                {t}
                <button type="button" aria-label={`Remove ${t}`} onClick={() => removeTheme(t)}>
                  ×
                </button>
              </span>
            ))}
            {selectedThemes.length === 0 && <span className="hint">No themes selected</span>}
          </div>
          <input
            value={themeInput}
            onChange={(e) => setThemeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTheme(themeInput)
              }
            }}
            placeholder="Type a theme and press Enter (creates it if new)"
          />
          {suggestions.length > 0 && (
            <div className="suggest">
              {suggestions.map((t) => (
                <button
                  type="button"
                  className="chip small"
                  key={t.id}
                  onClick={() => addTheme(t.name)}
                >
                  + {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lyrics */}
        <div className="field">
          <label htmlFor="lyrics_ur">Urdu lyrics</label>
          <textarea
            id="lyrics_ur"
            className="ur"
            value={fields.lyrics_ur}
            onChange={set('lyrics_ur')}
            dir="rtl"
            rows={8}
            placeholder="مکمل اردو متن…"
          />
        </div>
        <div className="field">
          <label htmlFor="lyrics_ro">Roman lyrics</label>
          <textarea id="lyrics_ro" value={fields.lyrics_ro} onChange={set('lyrics_ro')} rows={6} />
        </div>

        {/* Images */}
        <div className="field">
          <label>Images (scanned lyric sheets)</label>
          <span className="hint">Optional. JPG/PNG/WebP, up to 8 MB each. Shown first in the reciting view.</span>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click()
            }}
          >
            Drag &amp; drop images here, or click to choose
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {images.length > 0 && (
            <div className="thumbs">
              {images.map((item, i) => (
                <div className="thumb" key={item.key}>
                  <img
                    src={item.kind === 'server' ? item.img.url : item.url}
                    alt={`Image ${i + 1}`}
                  />
                  <div className="thumb-actions">
                    <button type="button" title="Move left" onClick={() => move(i, -1)} disabled={i === 0}>
                      ←
                    </button>
                    <button
                      type="button"
                      title="Move right"
                      onClick={() => move(i, 1)}
                      disabled={i === images.length - 1}
                    >
                      →
                    </button>
                    <button type="button" className="rm" title="Remove" onClick={() => removeImage(item)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="form-actions">
          <div className="group-btns" style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn" onClick={save} disabled={saving || !online}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create noha'}
            </button>
            <button className="btn ghost" onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </button>
          </div>
          {editing && (
            <button className="btn danger" onClick={onDelete} disabled={saving || !online}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
