import { useState } from 'react'

import { signOutCurrentUser } from '@/lib/auth/account'
import { restoreAccount, type AccountDeletionState } from '@/lib/auth/deletion'

export function AccountRecovery({ account }: { account: AccountDeletionState }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const deadline = account.purgeAt?.toDate()
  const canRestore = account.state === 'pending_deletion' && deadline && deadline.getTime() > Date.now()

  async function restore() {
    setBusy(true)
    setError('')
    try {
      await restoreAccount()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not restore your account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-ink">
      <h1 className="text-2xl font-bold">Account recovery</h1>
      {canRestore ? (
        <p>Your account is scheduled for deletion. You can restore it until {deadline.toLocaleString()}.</p>
      ) : <p>The recovery window has ended.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="flex gap-3">
        {canRestore && <button className="rounded border border-line px-4 py-2" type="button"
          disabled={busy} onClick={() => void restore()}>Restore Account</button>}
        <button className="rounded border border-line px-4 py-2" type="button"
          onClick={() => void signOutCurrentUser()}>Sign Out</button>
      </div>
    </main>
  )
}
