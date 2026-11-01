
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Friendship } from "@/lib/schema/types";

export function useFriendship( currentUid?: string, friendUid?: string ) {
    const [friendship, setFriendship] =
        useState<Friendship | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUid || !friendUid || currentUid === friendUid) {
            setFriendship(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const friendshipId = [currentUid, friendUid]
            .sort()
            .join("_");

        const friendshipRef = doc(db, "friendships", friendshipId);

        const unsubscribe = onSnapshot(
            friendshipRef,
            (snapshot) => {
                setFriendship(
                    snapshot.exists()
                        ? {
                            ...snapshot.data(),
                            id: snapshot.id,
                        } as Friendship
                        : null
                );

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

    const myWins = !friendship || !currentUid
        ? 0
        : friendship.uidA === currentUid
            ? friendship.uidAWins
            : friendship.uidBWins;

    const theirWins = !friendship || !friendUid
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
