import { useStatusHeartbeat } from '@/lib/onlineStatus/useStatusHeartbeat'

export default function OnlineStatusManager() {
  useStatusHeartbeat()
  return null
}