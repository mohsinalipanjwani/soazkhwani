import { useEffect, useState } from 'react'

/**
 * Android/Chromium: a custom "Install app" button wired to beforeinstallprompt.
 * iOS Safari has no such event — the app relies on the apple-touch-icon and
 * standalone meta tags in index.html for "Add to Home Screen" instead, so we
 * simply render nothing there.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
      setHidden(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred || hidden) return null

  return (
    <div className="install-fab no-print">
      <button
        className="btn gold"
        onClick={async () => {
          await deferred.prompt()
          await deferred.userChoice
          setDeferred(null)
        }}
      >
        ⇩ Install app
      </button>
    </div>
  )
}
