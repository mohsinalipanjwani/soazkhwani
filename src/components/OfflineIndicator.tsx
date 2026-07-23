import { useOnline } from '../hooks'

/** A small bar shown only while offline. Browsing/reciting still work from cache. */
export default function OfflineIndicator() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="offline-bar" role="status">
      ● You're offline — browsing works from cache; changes need a connection.
    </div>
  )
}
