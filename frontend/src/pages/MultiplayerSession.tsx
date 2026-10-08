import { Timestamp } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { LiveElo } from '@/components/LiveElo'
import { ProfileButton } from '@/components/ProfileButton'
import { RatingResult } from '@/components/RatingResult'
import { useAuth } from '@/lib/auth/useAuth'
import { cancelQueue, getQueueStatus } from '@/lib/matchmaking/api'
import { PRESET_MESSAGES } from '@/lib/multiplayer/types'
import { useSession } from '@/lib/multiplayer/useSession'

const button =
  'cursor-pointer rounded-xl border-2 border-accent-start px-5 py-3 font-bold focus-visible:outline-3 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50'

export function MultiplayerSession() {
  const { matchId } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { snapshot, receivedAt, connection, error, send, retry } = useSession(matchId, user?.uid)
  const [now, setNow] = useState(() => performance.now())
  const [leaving, setLeaving] = useState(false)
  // Keep local departure intent through the HTTP response and WebSocket abandonment update.
  const leaveRequested = useRef(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const [messageCooldown, setMessageCooldown] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!messageCooldown) return
    const timer = setTimeout(() => setMessageCooldown(false), 900)
    return () => clearTimeout(timer)
  }, [messageCooldown])
  const self = snapshot?.participants.find((p) => p.uid === user?.uid)
  const opponent = snapshot?.participants.find((p) => p.uid !== user?.uid)
  const serverNow = (snapshot?.serverTimeMs ?? 0) + Math.max(0, now - receivedAt)
  const elapsed = snapshot?.startedAtMs == null ? 0 : serverNow - snapshot.startedAtMs
  const countdown = Math.max(0, Math.ceil(-elapsed / 1000))
  const remaining = Math.max(0, Math.ceil(((snapshot?.durationMs ?? 0) - elapsed) / 1000))
  const running = snapshot?.state === 'in_progress' && !snapshot.finalizing
  const playable = running && elapsed >= 0 && remaining > 0 && connection === 'connected'
  const currentBeat = Math.max(0, Math.floor(elapsed / (snapshot?.beatMs ?? 1000)) + 1)
  const result = snapshot?.ratingEvents.find((event) => event.uid === user?.uid)

  useEffect(() => {
    if (
      snapshot?.state === 'abandoned' &&
      snapshot.completionReason === 'lobby_left' &&
      !leaveRequested.current
    ) {
      navigate('/multiplayer_connect', { replace: true })
    }
  }, [snapshot?.state, snapshot?.completionReason, leaving, navigate])

  function emote(phrase: (typeof PRESET_MESSAGES)[number]['id']) {
    if (
      messageCooldown ||
      connection !== 'connected' ||
      !snapshot ||
      !['lobby', 'in_progress'].includes(snapshot.state)
    )
      return
    send('emote', phrase)
    setMessageCooldown(true)
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || confirmResign) return
      const target = event.target instanceof HTMLElement ? event.target : document.body
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      const preset = PRESET_MESSAGES.find((item) => item.key === event.key)
      if (preset) {
        event.preventDefault()
        emote(preset.id)
      } else if (event.code === 'Space' && playable && target.tagName !== 'BUTTON') {
        event.preventDefault()
        send('demo_hit')
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  async function leaveLobby() {
    leaveRequested.current = true
    setLeaving(true)
    setLeaveError(null)
    try {
      const status = await getQueueStatus()
      if (status.match?.id === matchId && status.queueId) await cancelQueue(status.queueId)
      navigate('/home')
    } catch (failure) {
      leaveRequested.current = false
      setLeaveError(failure instanceof Error ? failure.message : 'Could not leave the lobby.')
      setLeaving(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col text-ink">
      <header className="relative flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-4 py-5 sm:px-12">
        <h1 className="text-3xl font-bold">Multiplayer</h1>
        <div className="flex items-center gap-3">
          <LiveElo />
          <ProfileButton
            className="w-36 shrink-0 sm:w-50"
            username={profile?.displayName ?? user?.email ?? '…'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        {(error || leaveError) && (
          <div role="alert" className="rounded-lg border-2 border-accent-start p-4">
            <p>{leaveError ?? error}</p>
            {connection !== 'connected' && (
              <div className="mt-3 flex flex-wrap gap-3">
                <button className={button} onClick={retry}>
                  Reconnect
                </button>
                <button className={button} onClick={() => navigate('/home')}>
                  Return Home
                </button>
              </div>
            )}
          </div>
        )}
        {!snapshot ? (
          <section className="text-center">
            <p role="status">Connecting to your match…</p>
            <button className={button + ' mt-6'} onClick={() => navigate('/home')}>
              Return Home
            </button>
          </section>
        ) : (
          <>
            {connection !== 'connected' && ['lobby', 'in_progress'].includes(snapshot.state) && (
              <section
                aria-label="Reconnecting to match"
                className="rounded-xl border-2 border-accent-start p-4"
              >
                <h2 className="text-xl font-bold">Reconnecting to your match</h2>
                <p className="mt-2">
                  Your latest match details are shown below. Live play resumes when the connection
                  is restored.
                </p>
              </section>
            )}
            <section
              aria-label={snapshot.state === 'lobby' ? 'Matched opponent' : 'Multiplayer match'}
              data-match-id={snapshot.id}
              data-scenario-version={snapshot.scenarioVersionId}
              className="rounded-xl border-3 border-accent-start bg-linear-to-br from-accent-base-start via-accent-base-middle to-accent-base-end p-5 sm:p-8"
            >
              <p className="text-sm capitalize">Shared scenario · {snapshot.instrument}</p>
              <h2 className="mt-1 text-2xl font-bold wrap-anywhere">{snapshot.scenarioTitle}</h2>
              <p className="mt-2 text-sm">
                Difficulty {snapshot.scenarioDifficulty}/10
                {snapshot.difficultySource === 'author' ? ' · Provisional' : ''}
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[self, opponent]
                  .filter((p) => !!p)
                  .map((p) => (
                    <article
                      key={p!.uid}
                      aria-label={
                        p!.uid === user?.uid ? 'Your performance' : 'Opponent performance'
                      }
                      className="min-w-0 rounded-lg border-2 border-accent-start p-4"
                    >
                      <h3 className="font-bold wrap-anywhere">
                        {p!.uid === user?.uid ? 'You' : p!.displayName} · {Math.round(p!.elo)} Elo
                      </h3>
                      <p className="mt-2 text-3xl font-bold">{Math.round(p!.score * 100)}%</p>
                      <p className="text-sm">
                        {p!.beatsHit}/{snapshot.totalBeats} demo beats
                      </p>
                      {snapshot.state === 'lobby' && (
                        <p className="mt-2">{p!.isReady ? 'Ready' : 'Not ready'}</p>
                      )}
                    </article>
                  ))}
              </div>
              {opponent &&
                connection === 'connected' &&
                !opponent.connected &&
                ['lobby', 'in_progress'].includes(snapshot.state) && (
                  <p role="status" className="mt-4 font-bold">
                    Opponent disconnected
                    {opponent.reconnectUntilMs != null
                      ? ' · ' +
                        Math.max(0, Math.ceil((opponent.reconnectUntilMs - serverNow) / 1000)) +
                        's to rejoin'
                      : ''}
                    . You can continue playing.
                  </p>
                )}
              {snapshot.state === 'lobby' && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    className={button + ' bg-accent-start'}
                    disabled={self?.isReady || connection !== 'connected'}
                    onClick={() => send('ready')}
                  >
                    {self?.isReady ? 'Ready — waiting for opponent' : 'Ready to play'}
                  </button>
                  <button
                    className={button}
                    disabled={leaving}
                    onClick={() => {
                      void leaveLobby()
                    }}
                  >
                    {leaving ? 'Leaving…' : 'Leave lobby'}
                  </button>
                </div>
              )}
              {snapshot.state === 'in_progress' && (
                <div className="mt-6 flex flex-col items-center gap-4 text-center">
                  <p role="status" className="text-3xl font-bold">
                    {snapshot.finalizing
                      ? 'Saving match results…'
                      : countdown > 0
                        ? 'Starting in ' + countdown
                        : remaining + 's remaining'}
                  </p>
                  <p className="text-sm">
                    Demo playthrough · Tap once each beat. Instrument scoring is not connected.
                  </p>
                  <progress
                    aria-label="Match progress"
                    max={snapshot.durationMs}
                    value={Math.min(snapshot.durationMs, Math.max(0, elapsed))}
                    className="h-3 w-full accent-accent-start"
                  />
                  <button
                    className={button + ' min-h-24 w-full max-w-sm bg-accent-start text-xl'}
                    disabled={!playable}
                    onClick={() => send('demo_hit')}
                  >
                    Tap beat {Math.min(currentBeat, snapshot.totalBeats)} · Space
                  </button>
                  <button
                    className={button}
                    disabled={!running || connection !== 'connected'}
                    onClick={() => setConfirmResign(true)}
                  >
                    Resign
                  </button>
                </div>
              )}
            </section>
            {['lobby', 'in_progress'].includes(snapshot.state) && (
              <section
                aria-label="Preset messages"
                className="rounded-xl border-2 border-accent-start p-5"
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {PRESET_MESSAGES.map((item) => (
                    <button
                      key={item.id}
                      className={button + ' px-2 text-sm'}
                      disabled={
                        messageCooldown || connection !== 'connected' || snapshot.finalizing
                      }
                      onClick={() => emote(item.id)}
                      aria-keyshortcuts={item.key}
                    >
                      {item.shortcut} {item.text}
                    </button>
                  ))}
                </div>
                <div
                  role="log"
                  aria-label="Match messages"
                  aria-live="polite"
                  className="mt-4 max-h-36 overflow-y-auto space-y-2"
                >
                  {snapshot.messages.map((item) => (
                    <p key={item.id}>
                      {item.uid === user?.uid ? 'You' : 'Opponent'}: {item.text}
                    </p>
                  ))}
                </div>
              </section>
            )}
            {snapshot.state === 'complete' && (
              <section aria-label="Match results" className="space-y-4">
                <h2 className="text-2xl font-bold">Match results</h2>
                {result && (
                  <RatingResult
                    event={{ ...result, appliedAt: Timestamp.fromDate(new Date(result.appliedAt)) }}
                  />
                )}
                <button className={button} onClick={() => navigate('/home')}>
                  Return Home
                </button>
              </section>
            )}
            {snapshot.state === 'abandoned' && (
              <section aria-label="Match ended" className="space-y-4">
                <h2 className="text-2xl font-bold">Match ended</h2>
                <p>
                  {snapshot.completionReason === 'server_restarted'
                    ? 'The session server restarted.'
                    : 'The session could not continue.'}{' '}
                  Elo was not changed.
                </p>
                <button className={button} onClick={() => navigate('/home')}>
                  Return Home
                </button>
              </section>
            )}
          </>
        )}
      </div>
      {confirmResign && running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="resign-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmResign(false)
              if (event.key === 'Tab') {
                const controls = event.currentTarget.querySelectorAll('button')
                const first = controls[0]
                const last = controls[controls.length - 1]
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault()
                  last?.focus()
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault()
                  first?.focus()
                }
              }
            }}
            className="w-full max-w-md rounded-xl border-3 border-accent-start bg-accent-base-start p-6"
          >
            <h2 id="resign-title" className="text-xl font-bold">
              Resign this match?
            </h2>
            <p className="mt-3">Your opponent wins and your Elo updates.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button autoFocus className={button} onClick={() => setConfirmResign(false)}>
                Keep playing
              </button>
              <button
                className={button + ' bg-accent-start'}
                onClick={() => {
                  send('resign')
                  setConfirmResign(false)
                }}
              >
                Confirm resign
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
