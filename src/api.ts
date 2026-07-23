/**
 * Thin API client. All requests go to the Worker at VITE_API_BASE.
 * Write requests attach the editor passcode as X-Editor-Key.
 */
import { getEditorKey } from './editor'
import type { Noha, NohaInput, NohaImage, Occasion, Theme } from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Query = Record<string, string | null | undefined>

function url(path: string, query?: Query): string {
  const u = new URL(API_BASE + path, API_BASE || window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== '') u.searchParams.set(k, v)
    }
  }
  return u.toString()
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; editor?: boolean; raw?: BodyInit } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined

  if (opts.raw !== undefined) {
    body = opts.raw
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  if (opts.editor) {
    const key = getEditorKey()
    if (key) headers['X-Editor-Key'] = key
  }

  let res: Response
  try {
    res = await fetch(url(path, opts.query), { method, headers, body })
  } catch {
    throw new ApiError('You appear to be offline.', 0)
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status)
  }
  // 204 / empty
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- Occasions ----
export const listOccasions = () => request<Occasion[]>('GET', '/api/occasions')
export const createOccasion = (name: string) =>
  request<Occasion>('POST', '/api/occasions', { body: { name }, editor: true })
export const updateOccasion = (id: string, patch: { name?: string; sort_order?: number }) =>
  request<Occasion>('PATCH', `/api/occasions/${id}`, { body: patch, editor: true })
export const deleteOccasion = (id: string) =>
  request<{ deleted: string }>('DELETE', `/api/occasions/${id}`, { editor: true })

// ---- Themes ----
export const listThemes = () => request<Theme[]>('GET', '/api/themes')
export const createTheme = (name: string) =>
  request<Theme>('POST', '/api/themes', { body: { name }, editor: true })

// ---- Nohas ----
export const listNohas = (params: { q?: string; occasion?: string; theme?: string } = {}) =>
  request<Noha[]>('GET', '/api/nohas', { query: params })
export const getNoha = (id: string) => request<Noha>('GET', `/api/nohas/${id}`)
export const createNoha = (input: NohaInput) =>
  request<Noha>('POST', '/api/nohas', { body: input, editor: true })
export const updateNoha = (id: string, input: NohaInput) =>
  request<Noha>('PATCH', `/api/nohas/${id}`, { body: input, editor: true })
export const deleteNoha = (id: string) =>
  request<{ deleted: string }>('DELETE', `/api/nohas/${id}`, { editor: true })

// ---- Images ----
export async function uploadImage(nohaId: string, file: File): Promise<NohaImage> {
  const fd = new FormData()
  fd.append('file', file)
  return request<NohaImage>('POST', `/api/nohas/${nohaId}/images`, { raw: fd, editor: true })
}
export const updateImageOrder = (imageId: string, sort_order: number) =>
  request<{ id: string; sort_order: number }>('PATCH', `/api/images/${imageId}`, {
    body: { sort_order },
    editor: true,
  })
export const deleteImage = (imageId: string) =>
  request<{ deleted: string }>('DELETE', `/api/images/${imageId}`, { editor: true })

// ---- Backup / import ----
export const exportAll = () => request<unknown>('GET', '/api/export')
export const importData = (payload: unknown, mode: 'merge' | 'replace') =>
  request<{ mode: string; occasionsAdded: number; themesAdded: number; nohasAdded: number }>(
    'POST',
    '/api/import',
    { body: payload, query: { mode }, editor: true },
  )
