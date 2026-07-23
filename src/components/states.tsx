import type { ReactNode } from 'react'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner error" role="alert">
      {message}
    </div>
  )
}

export function EmptyState({
  emblem = '۞',
  title,
  children,
}: {
  emblem?: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="state">
      <div className="emblem" aria-hidden>
        {emblem}
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  )
}
