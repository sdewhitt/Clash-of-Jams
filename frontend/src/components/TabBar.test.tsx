import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { TabBar } from './TabBar'

it('advances from the focused tab even before its owner commits selection', () => {
  const onSelect = vi.fn()
  render(
    <TabBar
      tabs={[
        { id: 'first', label: 'First' },
        { id: 'second', label: 'Second' },
        { id: 'third', label: 'Third' },
      ]}
      selected="first"
      onSelect={onSelect}
      idPrefix="fast-tabs"
      label="Examples"
    />,
  )
  const first = screen.getByRole('tab', { name: 'First' })
  first.focus()
  fireEvent.keyDown(first, { key: 'ArrowRight' })
  const second = screen.getByRole('tab', { name: 'Second' })
  expect(second).toHaveFocus()
  fireEvent.keyDown(second, { key: 'ArrowRight' })
  expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus()
  expect(onSelect.mock.calls.map(([id]) => id)).toEqual(['second', 'third'])
})
