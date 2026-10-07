/**
 * Template for the editor's "Browse Published Scenarios" tab.
 *
 * The listing itself is a query over public scenarios, which belongs to the
 * scenario-search stories; #24 only has to render the tab with its own empty
 * state and point at the search page that already exists.
 */
import { useNavigate } from 'react-router'

import { EmptyState } from '@/pages/scenario_editor/EmptyState'

export function BrowsePublishedPanel() {
  const navigate = useNavigate()

  return (
    <EmptyState
      title="No published scenarios yet"
      action={{ label: 'Go to Scenario Search', onClick: () => navigate('/scenario_search') }}
    >
      Scenarios other players have published will be listed here, ready to open as the starting
      point for your own version.
    </EmptyState>
  )
}
