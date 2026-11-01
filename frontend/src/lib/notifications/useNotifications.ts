
import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where, } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AppNotification } from '@/lib/schema/types'

export function useNotifications(uid: string) {
  const [ notifications, setNotifications ] = useState<AppNotification[]>([])
  const [ loading, setLoading ] = useState(true)
  const [ error, setError ] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setNotifications([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const q = query(
      collection(db, 'notifications'),
      where('notifiedUid', '==', uid),
      orderBy('createdAt', 'desc'),
    )

    const subscribe = onSnapshot(
      q,
      (snapshot) => {
        setNotifications(
          snapshot.docs.map((item) => ({
            ...item.data(),
          }) as AppNotification),
        )
        setLoading(false)
      },
      (err) => {
        console.error('Notification listener failed:', err)
        setError('Unable to load notifications.')
        setLoading(false)
      },
    )

    return subscribe
  }, [uid])

  const unreadCount = notifications.filter( (notification) => !notification.read, ).length

  return { notifications, unreadCount, loading, error }
}
