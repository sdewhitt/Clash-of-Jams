import { useNavigate } from 'react-router'
import { NavButton } from '@/components/NavButton'
import { ProfileButton } from '@/components/ProfileButton'
import { LiveElo } from '@/components/LiveElo'
import { useAuth } from '@/lib/auth/useAuth'
import { useActiveMatch } from '@/lib/matchmaking/useMatchmaking'

export function Home() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const activeMatch = useActiveMatch(user?.uid)

  function navPortal(location: string) {
    navigate(location)
  }

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <header className="relative flex flex-wrap items-center justify-between gap-4 bg-linear-to-r from-accent-base-start from-10% via-accent-base-middle via-70% to-accent-base-end to-90% border-b-4 border-accent-start px-4 py-4 sm:px-12 sm:py-6">
        <h1 className="whitespace-nowrap text-3xl font-bold sm:text-4xl">Clash of Jams</h1>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <LiveElo />
          <ProfileButton
            className="w-36 shrink-0 sm:w-50"
            username={profile?.displayName ?? user?.email ?? '…'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>

      <div className="px-6 py-6 flex-1 min-h-0 overflow-y-auto">
        <div className="w-full grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr] lg:gap-12">
          <nav className="flex flex-col gap-4 justify-center lg:gap-6">
            <NavButton onClick={() => navPortal('/scenario_search')}>Solo Play</NavButton>

            <NavButton onClick={() => navPortal('/multiplayer_connect')}>
              {activeMatch ? 'Rejoin Multiplayer' : 'Online Play'}
            </NavButton>

            <NavButton onClick={() => navPortal('/recent_matches')}>Recent Matches</NavButton>

            <NavButton onClick={() => navPortal('/leaderboards')}>Leaderboards</NavButton>

            <NavButton onClick={() => navPortal('/scenario_editor')}>Scenario Editor</NavButton>

            <NavButton onClick={() => navPortal('/tuner')}>Tuner</NavButton>

            <NavButton onClick={() => navPortal('/settings')}>Settings</NavButton>
          </nav>

          <section className="aspect-video w-full rounded-xl border-4 border-accent-start bg-linear-to-br from-accent-base-start from-10 via-accent-base-middle via-80 to-accent-base-end to-90 overflow-hidden">
            <img
              src="../../favicon.svg"
              alt="Clash of Jams Preview"
              className="w-full h-full object-cover"
            />
          </section>
        </div>
      </div>
    </main>
  )
}
