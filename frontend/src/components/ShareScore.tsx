/**
 * Sends a run's result to friends from the results screen (user story #37). Friends see the
 * scenario, the score and an optional message on their Shared With You page.
 */
import { useEffect, useState } from 'react'

import { listFriends, shareScore, type Friend } from '@/lib/scores/share'

/** Matches the limit firestore.rules puts on ScoreShare.message. */
const MAX_MESSAGE_LENGTH = 140

const buttonClass =
  'rounded-lg border-2 border-accent-start px-4 py-2 font-bold text-ink transition-colors ' +
  'hover:bg-accent-base-middle disabled:cursor-not-allowed disabled:opacity-50'

export interface ShareScoreProps {
  scenarioId: string
  scenarioTitle: string
  finalScore: number
  /** The saved run the share points at; null until the run is saved. */
  runId: string | null
  uid: string
}

type State =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'picking'; friends: Friend[] }
  | { kind: 'sending'; friends: Friend[] }
  | { kind: 'sent'; count: number }
  | { kind: 'error'; message: string }

export function ShareScore({ scenarioId, scenarioTitle, finalScore, runId, uid }: ShareScoreProps) {
  const [state, setState] = useState<State>({ kind: 'closed' })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (state.kind !== 'loading') return
    let cancelled = false
    listFriends(uid)
      .then((friends) => !cancelled && setState({ kind: 'picking', friends }))
      .catch(
        () =>
          !cancelled &&
          setState({ kind: 'error', message: 'Your friends list could not be loaded.' }),
      )
    return () => {
      cancelled = true
    }
  }, [state.kind, uid])

  async function send(friends: Friend[]) {
    if (!runId) return
    const recipientUids = [...chosen]
    setState({ kind: 'sending', friends })
    try {
      await shareScore({
        ownerUid: uid,
        runId,
        scenarioId,
        scenarioTitle,
        finalScore,
        message: message.trim(),
        recipientUids,
      })
      setState({ kind: 'sent', count: recipientUids.length })
      setChosen(new Set())
      setMessage('')
    } catch {
      setState({ kind: 'error', message: 'Your score could not be sent. Try again.' })
    }
  }

  function toggle(friendUid: string) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(friendUid)) next.delete(friendUid)
      else next.add(friendUid)
      return next
    })
  }

  return (
    <section
      aria-label="Share your score"
      className="flex w-full max-w-xl shrink-0 flex-col gap-3 rounded-xl border-3
        border-accent-start bg-accent-base-start px-5 py-4 text-ink"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Share your score</h3>
        {(state.kind === 'closed' || state.kind === 'sent' || state.kind === 'error') && (
          <button
            type="button"
            className={buttonClass}
            disabled={!runId}
            title={runId ? undefined : 'Your run is still being saved.'}
            onClick={() => setState({ kind: 'loading' })}
          >
            Send to friends
          </button>
        )}
      </div>

      {state.kind === 'loading' && <p className="text-sm text-muted">Loading friends...</p>}
      {state.kind === 'sent' && (
        <p role="status" className="text-sm font-semibold">
          Sent to {state.count} {state.count === 1 ? 'friend' : 'friends'}.
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="text-sm font-semibold text-accent-end">
          {state.message}
        </p>
      )}
      {(state.kind === 'picking' || state.kind === 'sending') &&
        (state.friends.length === 0 ? (
          <p className="text-sm text-muted">
            You have no friends to send this to yet. Add some from Friends, then come back.
          </p>
        ) : (
          <fieldset
            disabled={state.kind === 'sending'}
            className="flex flex-col gap-2 rounded-lg border-2 border-base-middle p-3"
          >
            <legend className="px-1 text-sm font-semibold">Send to</legend>
            {state.friends.map((friend) => (
              <label key={friend.uid} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.has(friend.uid)}
                  onChange={() => toggle(friend.uid)}
                  className="accent-accent-start"
                />
                {friend.displayName}
              </label>
            ))}
            <input
              type="text"
              value={message}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Add a message (optional)"
              aria-label="Message"
              onChange={(event) => setMessage(event.target.value)}
              className="rounded-lg border-2 border-base-middle bg-base-end px-3 py-2 text-ink
                placeholder:text-faint"
            />
            <div className="flex gap-3">
              <button
                type="button"
                className={buttonClass}
                disabled={chosen.size === 0}
                onClick={() => void send(state.friends)}
              >
                {state.kind === 'sending' ? 'Sending...' : 'Send'}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => setState({ kind: 'closed' })}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        ))}
    </section>
  )
}
