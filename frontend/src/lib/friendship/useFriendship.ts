
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { COLLECTIONS, friendshipId } from "@/lib/schema/collections";
import type { Friendship } from "@/lib/schema/types";

interface UseFriendshipResult {
  friendship: Friendship | null;
  myWins: number;
  theirWins: number;
  totalMatches: number;
  loading: boolean;
  error: string | null;
}

export function useFriendship( currentUid?: string, friendUid?: string ): UseFriendshipResult {
  const [friendship, setFriendship] = useState<Friendship | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUid || !friendUid || currentUid === friendUid) {
      setFriendship(null);
      setLoading(false);
      setError(null);
      return;
    }

    setFriendship(null);
    setLoading(true);
    setError(null);

    const id = friendshipId(currentUid, friendUid);
    const friendshipRef = doc(db, COLLECTIONS.friendships, id);

    const unsubscribe = onSnapshot(
      friendshipRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setFriendship({
            ...snapshot.data(),
            id: snapshot.id,
          } as Friendship);
        } else {
          setFriendship(null);
        }

        setLoading(false);
      },
      (err) => {
        console.error("Friendship listener failed:", err);
        setError("Unable to load friendship statistics.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUid, friendUid]);

  const myWins =
    !friendship || !currentUid
      ? 0
      : friendship.uidA === currentUid
        ? friendship.uidAWins
        : friendship.uidBWins;

  const theirWins =
    !friendship || !friendUid
      ? 0
      : friendship.uidA === friendUid
        ? friendship.uidAWins
        : friendship.uidBWins;

  return {
    friendship,
    myWins,
    theirWins,
    totalMatches: friendship?.totalFriendlies ?? 0,
    loading,
    error,
  };
}
