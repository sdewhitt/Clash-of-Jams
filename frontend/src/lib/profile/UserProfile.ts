import { doc, serverTimestamp, updateDoc, setDoc, runTransaction, } from 'firebase/firestore';
import { type Theme } from "@/context/ThemeContext";
import { db } from '@/lib/firebase';
import { scenarioThemesPath } from '../schema/collections';

export async function processImage(file: File): Promise<string> {
    const allowedTypes = [ "image/jpeg", "image/png", "image/webp", "image/svg", ];

    if (!allowedTypes.includes(file.type)) {
        throw new Error( "Uploaded images must be a JPG, PNG, SVG, or WebP file." );
    }
    
    const maxSize = 5 * 1024 * 1024;

    if (file.size > maxSize) {
        throw new Error( "Uploaded images must be smaller than 5 MB." );
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const image = new Image();

            image.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_SIZE = 256;
                let width = image.width;
                let height = image.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height = Math.round( height * (MAX_SIZE / width) );
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width = Math.round( width * (MAX_SIZE / height) );
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const context = canvas.getContext("2d");

                if (!context) {
                    reject(new Error("Could not process image."));
                    return;
                }

                context.drawImage( image, 0, 0, width, height );

                const compressedImage = canvas.toDataURL( "image/jpeg", 0.8 );

                resolve(compressedImage);
            };

            image.onerror = () => { reject(new Error("Could not read image.")); };

            image.src = reader.result as string;
        };

        reader.onerror = () => {
            reject(new Error("Could not read file."));
        };

        reader.readAsDataURL(file);
    });
}

export async function updateUserAvatar( uid: string, avatarUrl: string ) {
    const userRef = doc(db, "users", uid);

    await updateDoc(userRef, {
        avatarUrl: avatarUrl,
        updatedAt: serverTimestamp(),
    });
}

export async function updateUserTheme( uid: string, userTheme: Theme ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        theme: userTheme,
        updatedAt: serverTimestamp(),
    });
}

export async function updateUserBio( uid: string, bio: string ) {
    const userRef = doc(db, "users", uid);

    await updateDoc(userRef, {
        bio: bio,
        updatedAt: serverTimestamp(),
    });
}

export async function updateBioPublicity( uid: string, bio: boolean ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        publicBio: bio,
        updatedAt: serverTimestamp(),
    });
}

export async function updatePreferredGenres( uid: string, genres: string[] ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        preferredGenres: genres,
        updatedAt: serverTimestamp(),
    });
}

export async function updateGenrePublicity( uid: string, genres: string[] ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        publicGenres: genres,
        updatedAt: serverTimestamp(),
    });
}

export async function updatePreferredInstrument( uid: string, preferredInstrument: string ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        preferredInstrument: preferredInstrument,
        updatedAt: serverTimestamp(),
    });
}

export async function updateInstrumentPublicity( uid: string, instrument: boolean ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        publicInstrument: instrument,
        updatedAt: serverTimestamp(),
    });
}

export async function updateEloPublicity( uid: string, elo: string[] ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        publicElos: elo,
        updatedAt: serverTimestamp(),
    });
}

export async function updateScenarioThemeDefault( uid: string, theme: string ) {
    const userRef = doc(db, "userSettings", uid);

    await updateDoc(userRef, {
        scenarioTheme: theme,
        updatedAt: serverTimestamp(),
    });
}

export async function updateScenarioThemeAccompany( uid: string, themeName: string, accompanyTheme: string) {
    const userRef = doc(db, scenarioThemesPath(uid), themeName);

    await updateDoc(userRef, {
            themeName: themeName,
            accompanyTheme: accompanyTheme,
            updatedAt: serverTimestamp(),
        }
    );
}

export async function updateScenarioThemeAdvanced( uid: string, themeName: string, themeUrl: string, accompanyTheme: string) {
    const userRef = doc(db, scenarioThemesPath(uid), themeName);

    await setDoc( userRef, {
            uid: uid,
            themeName: themeName,
            themeUrl: themeUrl,
            accompanyTheme: accompanyTheme,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}


export async function updateUsername( uid: string, oldUsername: string, newUsername: string ) {
    const username = newUsername.trim().toLowerCase();

    if (username == oldUsername){
        return;
    }

    if ((username.length < 3) || (username.length > 20)) {
        throw new Error(
            "Valid usernames must be between 3-20 characters."
        );
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
        throw new Error(
            "Valid usernames can only contain letters, numbers, and underscores."
        );
    }

    const userRef = doc(db, "users", uid);
    const newUsernameRef = doc(db, "usernames", username);
    const oldUsernameRef = doc(db, "usernames", oldUsername);

    await runTransaction(db, async (transaction) => {
        const newUsernameSnapshot = await transaction.get(newUsernameRef);

        if (newUsernameSnapshot.exists()) {
            throw new Error("That username is already taken.");
        }

        transaction.update(userRef, {
            displayName: newUsername,
            username: newUsername,
            usernameLower: username,
            updatedAt: serverTimestamp(),
        });

        transaction.set(newUsernameRef, {uid: uid, createdAt: serverTimestamp(), username: newUsername});

        transaction.delete(oldUsernameRef);
    });

    return username;
}