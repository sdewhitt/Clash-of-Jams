/**
 * The shared "nothing here yet" block the editor's template tabs render.
 *
 * Both Browse Published Scenarios and Your Library are placeholders until the
 * scenario query paths land, and both want the same shape: a heading, a line of
 * explanation, and one action.
 */
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  children: ReactNode
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed
        border-base-middle bg-base-end px-8 py-16 text-center"
    >
      <h3 className="text-2xl font-bold text-ink">{title}</h3>
      <p className="max-w-prose text-muted">{children}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-lg bg-linear-to-b from-contrast-start from-50 via-contrast-middle
            to-contrast-end to-70 px-6 py-3 font-bold text-ink outline-3 outline-contrast-middle
            transition-all hover:brightness-125 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
