import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getNoha } from '../api'
import type { Noha } from '../types'
import { useEditor } from '../editor'
import { EmptyState, ErrorBanner, Loading } from '../components/states'
import Lightbox from '../components/Lightbox'

type Mode = 'ur' | 'ro' | 'both'

export default function Recite() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isEditor } = useEditor()

  const [noha, setNoha] = useState<Noha | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('ur')
  const [size, setSize] = useState(2) // rem, drives --recite-size
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    getNoha(id)
      .then((n) => {
        setNoha(n)
        // Default the toggle to whatever text this noha actually has.
        if (!n.lyrics_ur && n.lyrics_ro) setMode('ro')
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Loading label="Opening noha…" />
  if (error)
    return (
      <div>
        <ErrorBanner message={error} />
        <Link className="btn" to="/">
          ← Back to fihrist
        </Link>
      </div>
    )
  if (!noha)
    return (
      <EmptyState title="Noha not found">
        <Link className="btn mt" to="/">
          Back to fihrist
        </Link>
      </EmptyState>
    )

  const hasImages = noha.images.length > 0
  const hasText = !!noha.lyrics_ur || !!noha.lyrics_ro
  const showUr = (mode === 'ur' || mode === 'both') && noha.lyrics_ur
  const showRo = (mode === 'ro' || mode === 'both') && noha.lyrics_ro
  const canToggle = !!noha.lyrics_ur && !!noha.lyrics_ro

  return (
    <div>
      <div className="recite-toolbar no-print">
        <div className="group-btns">
          <Link className="btn ghost small" to="/">
            ← Fihrist
          </Link>
          {isEditor && (
            <Link className="btn ghost small" to={`/noha/${noha.id}/edit`}>
              Edit
            </Link>
          )}
          <button className="btn ghost small" onClick={() => window.print()}>
            🖶 Print
          </button>
        </div>

        {hasText && (
          <div className="group-btns">
            {canToggle && (
              <div className="toggle" role="group" aria-label="Script">
                <button className={mode === 'ur' ? 'active' : ''} onClick={() => setMode('ur')}>
                  اردو
                </button>
                <button className={mode === 'ro' ? 'active' : ''} onClick={() => setMode('ro')}>
                  Roman
                </button>
                <button className={mode === 'both' ? 'active' : ''} onClick={() => setMode('both')}>
                  Both
                </button>
              </div>
            )}
            <div className="toggle" role="group" aria-label="Text size">
              <button onClick={() => setSize((s) => Math.max(1.2, +(s - 0.2).toFixed(2)))} aria-label="Smaller text">
                A−
              </button>
              <button onClick={() => setSize((s) => Math.min(4, +(s + 0.2).toFixed(2)))} aria-label="Larger text">
                A+
              </button>
            </div>
          </div>
        )}
      </div>

      <article
        className="scroll-surface"
        style={{ ['--recite-size' as string]: `${size}rem` }}
      >
        <header className="noha-head">
          {noha.title_ur && <div className="title-ur">{noha.title_ur}</div>}
          {noha.title_ro && <div className="title-ro">{noha.title_ro}</div>}
          <div className="meta">
            {noha.poet && <span>شاعر / Shayar: {noha.poet}</span>}
            {noha.reciter && <span>نوحہ خوان / Reciter: {noha.reciter}</span>}
            {noha.soz && <span>Soz: {noha.soz}</span>}
            {noha.party && <span>Party: {noha.party}</span>}
          </div>
          {noha.themes.length > 0 && (
            <div className="tags">
              {noha.themes.map((t) => (
                <span className="tag" key={t.id}>
                  {t.name}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Image noha: images first, full width, tap to zoom. */}
        {hasImages && (
          <div className="noha-images">
            {noha.images.map((img) => (
              <img
                key={img.id}
                src={img.url}
                alt={noha.title_ro || noha.title_ur || 'Noha image'}
                loading="lazy"
                onClick={() => setZoom(img.url)}
              />
            ))}
          </div>
        )}

        {/* Typed lyrics (shown below images if both exist). */}
        {hasText && (
          <div className={mode === 'both' ? 'lyrics-both' : ''}>
            {hasImages && <div className="section-label">Text</div>}
            {showUr && <div className="lyrics ur">{noha.lyrics_ur}</div>}
            {showRo && <div className="lyrics ro">{noha.lyrics_ro}</div>}
          </div>
        )}

        {!hasImages && !hasText && (
          <p className="center" style={{ color: 'var(--ink-soft)' }}>
            This noha has no text or images yet.
          </p>
        )}

        {noha.source && (
          <p className="center no-print" style={{ color: 'var(--ink-soft)', marginTop: '1.5rem', fontSize: '0.85rem' }}>
            Source: {noha.source}
          </p>
        )}
      </article>

      {zoom && (
        <Lightbox src={zoom} alt={noha.title_ro || 'Noha'} onClose={() => setZoom(null)} />
      )}

      <div className="center mt no-print">
        <button className="btn ghost" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>
    </div>
  )
}
