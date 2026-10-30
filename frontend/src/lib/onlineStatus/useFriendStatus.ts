
import { useEffect, useState } from 'react'
import { doc, onSnapshot, type Timestamp, } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ONLINE_TIMEOUT_MS } from '@/lib/onlineStatus/status'

interface FriendPresenceState {
  isOnline: boolean
  dnd: boolean
  loading: boolean
}

export function useOnlineStatus( uid: string, ): FriendPresenceState {
  const [ lastHeartbeat, setLastHeartbeat ] = useState<number | null>(null);
  const [ dnd, setDnd ] = useState<boolean>(false);
  const [ loading, setLoading ] = useState(true);
  const [ now, setNow ] = useState(() => Date.now());

  useEffect(() => {
    setLastHeartbeat(null)
    setDnd(false)
    setLoading(true)

    const unsubscribe = onSnapshot(
      doc(db, 'userStatus', uid),
      (snapshot) => {
        const data = snapshot.data()

        const heartbeat = data?.lastHeartbeat as Timestamp | undefined
        const mode = (data?.dnd as boolean | undefined) ?? false

        setLastHeartbeat(heartbeat?.toMillis() ?? null)
        setDnd(mode)
        setLoading(false)
      },
      (error) => {
        console.error('Presence listener failed:', error)
        setLoading(false)
      },
    )

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 30_000)

    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [uid])

  const isOnline = lastHeartbeat !== null && now - lastHeartbeat < ONLINE_TIMEOUT_MS

  return { isOnline, dnd, loading }
}
