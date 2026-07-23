import { useEffect } from 'react'

/** Simple tap-to-zoom lightbox for image nohas. Esc or tap to close. */
export default function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="btn ghost close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <img src={src} alt={alt} />
    </div>
  )
}
