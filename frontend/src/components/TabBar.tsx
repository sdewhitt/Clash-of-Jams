/**
 * An accessible tab strip: one button per tab, arrow keys move between them.
 *
 * Purely presentational — the owner holds the selected id, so a page can keep
 * that state wherever it likes (the Scenario Editor keeps it in the URL).
 * Element ids are derived from `idPrefix` so the matching panel can point back
 * at its tab with aria-labelledby.
 */
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'

import { panelId, tabId } from '@/components/tabIds'

export interface TabDefinition<Id extends string> {
  id: Id
  label: string
}

interface TabBarProps<Id extends string> {
  tabs: readonly TabDefinition<Id>[]
  selected: Id
  onSelect: (id: Id) => void
  /** Shared prefix for the generated tab/panel ids; the panel must reuse it. */
  idPrefix: string
  /** Describes the strip for screen readers, e.g. "Scenario Editor sections". */
  label: string
}

export function TabBar<Id extends string>({
  tabs,
  selected,
  onSelect,
  idPrefix,
  label,
}: TabBarProps<Id>) {
  const stripRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return

    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === selected)
    const next = tabs[(index + step + tabs.length) % tabs.length]
    onSelect(next.id)
    // The tablist pattern expects focus to follow the selection.
    stripRef.current?.querySelector<HTMLButtonElement>(`#${tabId(idPrefix, next.id)}`)?.focus()
  }

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="flex flex-wrap gap-2 border-b-2 border-line"
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === selected
        return (
          <button
            key={tab.id}
            id={tabId(idPrefix, tab.id)}
            role="tab"
            type="button"
            aria-selected={isSelected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={`-mb-0.5 rounded-t-lg border-b-4 px-5 py-3 font-bold transition-colors ${
              isSelected
                ? 'border-accent-soft bg-accent text-ink'
                : 'border-transparent text-muted hover:bg-accent-base hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
