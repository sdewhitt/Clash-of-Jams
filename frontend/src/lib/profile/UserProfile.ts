import { doc, serverTimestamp, updateDoc, } from 'firebase/firestore';
import { type Theme } from "@/context/ThemeContext";
import { isUsernameAvailable } from '../auth/account';
import { AuthError } from '../auth/account';
import { db } from '@/lib/firebase';

export async function processAvatar(file: File): Promise<string> {
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

export async function updateUsername( uid: string, newUsername: string ) {
    const username = newUsername.trim();
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

    if (!(await isUsernameAvailable(username))) {
        throw new AuthError('That username is taken.')
    }

    const usernameLower = username.toLowerCase();

    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
        username: username,
        usernameLower: usernameLower,
        updatedAt: serverTimestamp(),
    });

    return username;
}