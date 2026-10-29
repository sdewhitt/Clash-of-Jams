import { useEffect } from 'react'
import { useAuth } from '@/lib/auth/useAuth'
import { HEARTBEAT_INTERVAL_MS, writeHeartbeat } from '@/lib/onlineStatus/status'

export function useStatusHeartbeat() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading || !user) { 
      return
    }

    let stopped = false
    let writing = false
    let intervalId: number | undefined

    const heartbeat = async () => {
      if (stopped || writing) {
        return
      }
      if (document.visibilityState !== 'visible') {
        return
      }

      writing = true
      
      try {
        await writeHeartbeat(user.uid)
      } catch (error) {
        console.error('Updating online status heartbeat failed:', error)
      } finally {
        writing = false
      }
    }

    const start = () => {
      if (stopped || intervalId !== undefined) {
        return
      }
      intervalId = window.setInterval(() => { void heartbeat() }, HEARTBEAT_INTERVAL_MS)
      void heartbeat()
    }

    const stop = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        stop()
      }
    }

    handleVisibility()

    document.addEventListener( 'visibilitychange', handleVisibility, )

    return () => {
      stopped = true
      stop()

      document.removeEventListener( 'visibilitychange', handleVisibility, )
    }
  }, [user, loading])
}
