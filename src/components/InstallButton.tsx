import { useEffect, useState } from 'react'

/**
 * PWA install affordance.
 *
 * - Android/Chromium: uses the `beforeinstallprompt` event (captured early in
 *   index.html and stashed on window.__deferredInstallPrompt) to show a custom
 *   "Install app" button that triggers the native prompt.
 * - iOS Safari: has no such event, so we show an "Add to Home Screen" button
 *   that reveals the manual Share-sheet instructions instead.
 * - Already installed / running standalone: renders nothing.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent | null
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes navigator.standalone when launched from home screen
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  const iOSDevice = /iPhone|iPad|iPod/i.test(ua)
  // iPadOS 13+ reports as Mac; detect via touch support
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOSDevice || iPadOS
}

export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => window.__deferredInstallPrompt ?? null,
  )
  const [installed, setInstalled] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => {
    const onAvailable = () => setDeferred(window.__deferredInstallPrompt ?? null)
    const onInstalled = () => {
      setDeferred(null)
      setInstalled(true)
    }
    // Cover the case where the event fires after mount too.
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('pwa-install-available', onAvailable)
    window.addEventListener('pwa-installed', onInstalled)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable)
      window.removeEventListener('pwa-installed', onInstalled)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || isStandalone()) return null

  // Android / Chromium: native prompt available.
  if (deferred) {
    return (
      <div className="install-fab no-print">
        <button
          className="btn gold"
          onClick={async () => {
            await deferred.prompt()
            await deferred.userChoice
            window.__deferredInstallPrompt = null
            setDeferred(null)
          }}
        >
          ⇩ Install app
        </button>
      </div>
    )
  }

  // iOS Safari: no prompt event — guide the user through Add to Home Screen.
  if (isIOS()) {
    return (
      <div className="install-fab no-print">
        {showIosHelp && (
          <div className="ios-install-help" role="dialog" aria-label="Install instructions">
            <button
              className="ios-install-close"
              aria-label="Close"
              onClick={() => setShowIosHelp(false)}
            >
              ✕
            </button>
            <strong>Install on your iPhone</strong>
            <ol>
              <li>
                Tap the <b>Share</b> button (the square with an ↑) in Safari's toolbar.
              </li>
              <li>
                Scroll down and tap <b>Add to Home Screen</b>.
              </li>
              <li>
                Tap <b>Add</b> — the app opens full-screen with its own icon.
              </li>
            </ol>
          </div>
        )}
        <button className="btn gold" onClick={() => setShowIosHelp((v) => !v)}>
          ⇩ Add to Home Screen
        </button>
      </div>
    )
  }

  // Desktop/other browsers before the prompt is available: nothing to show.
  return null
}
