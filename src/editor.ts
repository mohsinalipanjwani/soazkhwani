/**
 * The single "am I an editor?" module.
 *
 * Today: a shared passcode kept in sessionStorage and sent as X-Editor-Key.
 * Later: swap the internals here for Cloudflare Access / real logins without
 * touching any screen — the rest of the app only calls useEditor()/getEditorKey().
 */
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'noha_editor_key'
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getEditorKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setEditorKey(key: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* private mode — key lives only for this tab session in memory */
  }
  emit()
}

export function clearEditorKey() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  emit()
}

export function isEditor(): boolean {
  return !!getEditorKey()
}

/**
 * Ensure a passcode is present, prompting for it once if not.
 * Returns the key, or null if the user cancelled.
 */
export function ensureEditorKey(): string | null {
  const existing = getEditorKey()
  if (existing) return existing
  const entered = window.prompt('Enter the editor passcode')
  if (entered && entered.trim()) {
    setEditorKey(entered.trim())
    return entered.trim()
  }
  return null
}

// React binding
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useEditor(): { isEditor: boolean; key: string | null } {
  const key = useSyncExternalStore(subscribe, getEditorKey, () => null)
  return { isEditor: !!key, key }
}
