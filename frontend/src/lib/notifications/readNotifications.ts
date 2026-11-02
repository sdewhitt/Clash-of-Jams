import { deleteDoc, doc, updateDoc, } from 'firebase/firestore'
import { db } from '@/lib/firebase'
  
export async function markNotificationRead( notificationId: string, ) {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc( notificationRef, { read: true }, );
}

export async function deleteNotification( notificationId: string, ) {
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
}
  