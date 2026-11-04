import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { signOutCurrentUser } from '@/lib/auth/account'
import { requestAccountDeletion } from '@/lib/auth/deletion'
import { useAuth } from '@/lib/auth/useAuth'

export function AccountDeletionSetting() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const dialog = useRef<HTMLDialogElement>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const usesPassword = user?.providerData?.some(({ providerId }) => providerId === 'password')

  async function confirm() {
    if (!user || busy) return
    setBusy(true)
    setError('')
    try {
      const { purgeAt } = await requestAccountDeletion(user, password)
      dialog.current?.close()
      await signOutCurrentUser()
      navigate('/login', { replace: true, state: { purgeAt } })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not schedule account deletion.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex w-full max-w-2xl flex-wrap items-center justify-between gap-4 rounded-xl border-3 border-accent-start bg-base-middle p-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Account</h2>
        <p className="text-sm text-muted">Review what happens when you delete your account.</p>
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        className="rounded-xl border-3 border-red-500 bg-base-start px-6 py-3 font-bold text-ink"
        onClick={() => {
          setPassword('')
          setError('')
          dialog.current?.showModal()
        }}
      >
        Delete Account
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        onCancel={(event) => { if (busy) event.preventDefault() }}
        className="m-auto w-11/12 max-w-md rounded-xl border border-line bg-base-middle p-6 text-ink backdrop:bg-black/70"
      >
        <h2 id="delete-account-title" className="text-2xl font-bold">Delete Account</h2>
        <p id="delete-account-description" className="mt-3">
          Your profile will be hidden and you will be signed out. You can sign in and restore
          your account within 30 days, after which your personal data is permanently deleted.
        </p>
        <form onSubmit={(event) => { event.preventDefault(); void confirm() }}>
          {usesPassword && (
            <label className="mt-4 block">
              Confirm your password
              <input type="password" autoComplete="current-password" required value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded border border-line bg-base-start p-2" />
            </label>
          )}
          {error && <p role="alert" className="mt-3">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" disabled={busy} className="rounded-lg border border-line px-4 py-2"
              onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" disabled={busy} className="rounded-lg border border-red-500 px-4 py-2 font-bold">
              {busy ? 'Confirming…' : 'Confirm Deletion'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  )
}
