export interface Occasion {
  id: string
  name: string
  slug: string
  sort_order: number
  created_at: number
}

export interface Theme {
  id: string
  name: string
}

export interface NohaImage {
  id: string
  r2_key: string
  url: string
  sort_order: number
}

export interface Noha {
  id: string
  occasion_id: string | null
  title_ur: string | null
  title_ro: string | null
  poet: string | null
  reciter: string | null
  soz: string | null
  party: string | null
  lyrics_ur: string | null
  lyrics_ro: string | null
  source: string | null
  sort_order: number
  created_at: number
  updated_at: number
  themes: Theme[]
  images: NohaImage[]
}

// Payload for create/update. `themes` are theme NAMES (created if missing).
export interface NohaInput {
  occasion_id?: string | null
  title_ur?: string | null
  title_ro?: string | null
  poet?: string | null
  reciter?: string | null
  soz?: string | null
  party?: string | null
  lyrics_ur?: string | null
  lyrics_ro?: string | null
  source?: string | null
  themes?: string[]
}
