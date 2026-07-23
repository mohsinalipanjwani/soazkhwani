import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listNohas, listOccasions, listThemes } from '../api'
import type { Noha, Occasion, Theme } from '../types'
import { useEditor } from '../editor'
import { EmptyState, ErrorBanner, Loading } from '../components/states'

export default function Fihrist() {
  const { isEditor } = useEditor()
  const [occasions, setOccasions] = useState<Occasion[]>([])
  const [themes, setThemes] = useState<Theme[]>([])
  const [nohas, setNohas] = useState<Noha[]>([])

  const [q, setQ] = useState('')
  const [occasion, setOccasion] = useState<string | null>(null)
  const [theme, setTheme] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load filter sources once.
  useEffect(() => {
    Promise.all([listOccasions(), listThemes()])
      .then(([occ, th]) => {
        setOccasions(occ)
        setThemes(th)
      })
      .catch(() => {
        /* handled by the noha load below */
      })
  }, [])

  // Debounce the search query so we don't hit the API on every keystroke.
  const debouncedQ = useDebounced(q, 250)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listNohas({ q: debouncedQ, occasion: occasion ?? undefined, theme: theme ?? undefined })
      .then((rows) => {
        if (!cancelled) setNohas(rows)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQ, occasion, theme])

  // Group results by occasion, ordered by occasions.sort_order.
  const groups = useMemo(() => {
    const byId = new Map<string, Noha[]>()
    const uncategorised: Noha[] = []
    for (const n of nohas) {
      if (n.occasion_id) {
        const arr = byId.get(n.occasion_id) ?? []
        arr.push(n)
        byId.set(n.occasion_id, arr)
      } else {
        uncategorised.push(n)
      }
    }
    const ordered = [...occasions]
      .sort((a, b) => a.sort_order - b.sort_order)
      .filter((o) => byId.has(o.id))
      .map((o) => ({ id: o.id, name: o.name, items: byId.get(o.id)! }))
    if (uncategorised.length) {
      ordered.push({ id: '_none', name: 'Unfiled', items: uncategorised })
    }
    return ordered
  }, [nohas, occasions])

  const hasFilters = !!q || !!occasion || !!theme
  const activeFilterCount = (occasion ? 1 : 0) + (theme ? 1 : 0)
  const clearFilters = () => {
    setQ('')
    setOccasion(null)
    setTheme(null)
  }

  return (
    <div>
      <div className="searchbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, poet, reciter, lyrics, themes…"
          aria-label="Search nohas"
        />
      </div>

      {(occasions.length > 0 || themes.length > 0) && (
        <div className="filters-accordion">
          <button
            className="filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="filters-panel"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <span className="filters-toggle-label">
              <span className={`chevron ${filtersOpen ? 'open' : ''}`} aria-hidden>
                ▸
              </span>
              Filters
              {activeFilterCount > 0 && <span className="filters-badge">{activeFilterCount}</span>}
            </span>
            {activeFilterCount > 0 && (
              <span
                className="filters-clear"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  setOccasion(null)
                  setTheme(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    setOccasion(null)
                    setTheme(null)
                  }
                }}
              >
                Clear
              </span>
            )}
          </button>

          {filtersOpen && (
            <div className="filters-panel" id="filters-panel">
              {occasions.length > 0 && (
                <div className="filter-group">
                  <div className="filter-label">Occasion</div>
                  <div className="chips">
                    <button
                      className={`chip ${occasion === null ? 'active' : ''}`}
                      onClick={() => setOccasion(null)}
                    >
                      All
                    </button>
                    {[...occasions]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((o) => (
                        <button
                          key={o.id}
                          className={`chip ${occasion === o.id ? 'active' : ''}`}
                          onClick={() => setOccasion(occasion === o.id ? null : o.id)}
                        >
                          {o.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {themes.length > 0 && (
                <div className="filter-group">
                  <div className="filter-label">Theme</div>
                  <div className="chips">
                    {themes.map((t) => (
                      <button
                        key={t.id}
                        className={`chip ${theme === t.id ? 'active' : ''}`}
                        onClick={() => setTheme(theme === t.id ? null : t.id)}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <Loading label="Loading fihrist…" />
      ) : groups.length === 0 ? (
        hasFilters ? (
          <EmptyState title="No matching nohas">
            <p>Nothing matched your search or filters.</p>
            <button className="btn mt" onClick={clearFilters}>
              Clear filters
            </button>
          </EmptyState>
        ) : (
          <EmptyState title="No nohas yet">
            <p>The directory is empty.</p>
            {isEditor ? (
              <Link className="btn mt" to="/add">
                + Add the first noha
              </Link>
            ) : (
              <p>An editor can add the first noha.</p>
            )}
          </EmptyState>
        )
      ) : (
        groups.map((g) => {
          const count = `${g.items.length} ${g.items.length === 1 ? 'noha' : 'nohas'}`
          // While searching/filtering, keep every group open so results are visible.
          // Otherwise groups are collapsed by default and open on demand.
          const open = hasFilters || expandedGroups.has(g.id)
          return (
            <section className="group" key={g.id}>
              {hasFilters ? (
                <div className="group-head">
                  <h2>{g.name}</h2>
                  <span className="group-count">{count}</span>
                </div>
              ) : (
                <button
                  className="group-head group-toggle"
                  aria-expanded={open}
                  onClick={() => toggleGroup(g.id)}
                >
                  <span className="group-head-left">
                    <span className={`chevron ${open ? 'open' : ''}`} aria-hidden>
                      ▸
                    </span>
                    <h2>{g.name}</h2>
                  </span>
                  <span className="group-count">{count}</span>
                </button>
              )}
              {open && (
                <div className="noha-list">
                  {g.items.map((n) => (
                    <NohaCard key={n.id} noha={n} />
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

function NohaCard({ noha }: { noha: Noha }) {
  const hasImages = noha.images.length > 0
  return (
    <Link className="noha-card" to={`/noha/${noha.id}`}>
      {noha.title_ur ? (
        <div className="title-ur">{noha.title_ur}</div>
      ) : (
        <div className="title-ro">{noha.title_ro || 'Untitled'}</div>
      )}
      {noha.title_ur && noha.title_ro && <div className="title-ro">{noha.title_ro}</div>}
      <div className="meta">
        {noha.poet && <span>Shayar: {noha.poet}</span>}
        {noha.reciter && <span>Noha Khuwan: {noha.reciter}</span>}
      </div>
      {(noha.themes.length > 0 || hasImages) && (
        <div className="tags">
          {noha.themes.map((t) => (
            <span className="tag" key={t.id}>
              {t.name}
            </span>
          ))}
          {hasImages && (
            <span className="img-badge" title="Image noha">
              🖼 image
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  const ref = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(ref.current)
    ref.current = setTimeout(() => setV(value), ms)
    return () => clearTimeout(ref.current)
  }, [value, ms])
  return v
}
