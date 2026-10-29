import { doc, serverTimestamp, setDoc, } from 'firebase/firestore'
import { db } from '@/lib/firebase'
  
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000
export const ONLINE_TIMEOUT_MS = 8 * 60 * 1000

export async function writeHeartbeat(uid: string): Promise<void> {
    const statusRef = doc(db, 'userStatus', uid)
    await setDoc( statusRef, { lastHeartbeat: serverTimestamp(), }, { merge: true }, )
}
    