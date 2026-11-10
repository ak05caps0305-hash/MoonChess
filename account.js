
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, runTransaction, onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const configured = firebaseConfig.apiKey !== 'PASTE_API_KEY';
export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export const isGuest = () =>
  sessionStorage.getItem('moonchess.guest') === 'yes';

export const playGuest = () => {
  sessionStorage.setItem('moonchess.guest', 'yes');
  location.href = 'index.html';
};

export const leaveGuest = () =>
  sessionStorage.removeItem('moonchess.guest');

export function requireSession(callback) {
  if (!configured) {
    if (isGuest()) callback(null);
    else location.replace('auth.html');
    return;
  }

  onAuthStateChanged(auth, user => {
    if (user) {
      leaveGuest();
      callback(user);
    } else if (isGuest()) {
      callback(null);
    } else {
      location.replace('auth.html');
    }
  });
}

export async function register(username, email, password) {
  username = username.trim();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw Error('Username must be 3–20 letters, numbers, or underscores.');
  }

  const result = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(result.user, { displayName: username });

  await setDoc(doc(db, 'users', result.user.uid), {
    username,
    email: result.user.email,
    coins: 0,
    solved: [],
    createdAt: Date.now()
  });

  leaveGuest();
  return result.user;
}

export async function login(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  leaveGuest();
  return result.user;
}

export async function logout() {
  leaveGuest();
  if (auth) await signOut(auth);
  location.href = 'auth.html';
}

export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function watchProfile(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), snap =>
    callback(snap.exists() ? snap.data() : { coins: 0, solved: [] })
  );
}

export async function awardPuzzle(uid, id) {
  const ref = doc(db, 'users', uid);
  const key = 'lichess:' + id;

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : { coins: 0, solved: [] };
    const solved = Array.isArray(data.solved) ? data.solved : [];

    if (solved.includes(key)) return false;

    tx.set(ref, {
      coins: (Number(data.coins) || 0) + 10,
      solved: [...solved, key]
    }, { merge: true });

    return true;
  });
}

