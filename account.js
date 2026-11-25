import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, runTransaction, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
export const configured = firebaseConfig.apiKey !== 'PASTE_API_KEY';
export const app = configured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const isGuest = () => sessionStorage.getItem('moonchess.guest') === 'yes';
export const playGuest = () => { sessionStorage.setItem('moonchess.guest','yes'); location.href='index.html'; };
export const leaveGuest = () => sessionStorage.removeItem('moonchess.guest');
export function requireSession(callback) {
  if (!configured) { if (isGuest()) callback(null); else location.replace('auth.html'); return; }
  onAuthStateChanged(auth, user => {
    if (user) { leaveGuest(); callback(user); }
    else if (isGuest()) callback(null);
    else location.replace('auth.html');
  });
}
export async function register(username,email,password) {
  username=username.trim();
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw Error('Username must be 3–20 letters, numbers, or underscores.');
  const result=await createUserWithEmailAndPassword(auth,email,password);
  await updateProfile(result.user,{displayName:username});
  await setDoc(doc(db,'users',result.user.uid),{username,email:result.user.email,coins:0,solved:[],failed:[],rating:1000,createdAt:Date.now()});
  leaveGuest(); return result.user;
}
export async function login(email,password) { const r=await signInWithEmailAndPassword(auth,email,password);leaveGuest();return r.user; }
export async function logout() { leaveGuest(); if(auth) await signOut(auth); location.href='auth.html'; }
export async function resetPassword(email) { return sendPasswordResetEmail(auth,email); }
export function watchProfile(uid,callback) { return onSnapshot(doc(db,'users',uid),snap=>callback(snap.exists()?snap.data():{coins:0,solved:[]})); }
export async function awardPuzzle(uid,id,puzzleRating, daily=false) {
  const ref=doc(db,'users',uid);const key='lichess:'+id;
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);const data=snap.exists()?snap.data():{coins:0,solved:[]};
    const solved=Array.isArray(data.solved)?data.solved:[];
    const day=Math.floor(Date.now()/86400000);
    const bonus=daily && (data.dailyDay ?? -1)<day;
    if(solved.includes(key)) {
      if(bonus) tx.update(ref,{coins:data.coins+25,dailyDay:day});
      return {gain:0,coins:bonus?25:0};
    }
    const currentRating = Number.isFinite(data.rating) ? data.rating : 1000;
    const difference = Number(puzzleRating) - currentRating;
    const gain = Math.max(1, Math.min(5, 3 + Math.floor(difference / 25)));
    const rating=currentRating+gain;
    tx.set(ref,{coins:(Number(data.coins)||0)+(bonus?25:10),solved:[...solved,key],rating,ratingHistory:history(data,currentRating,rating),...(bonus?{dailyDay:day}:{})},{merge:true});
    return {gain,coins:bonus?25:10};
  });
}

// A wrong attempt is penalized only once per puzzle per account.
export async function penalizePuzzle(uid,id,puzzleRating) {
  const ref=doc(db,'users',uid), key='lichess:'+id;
  return runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists()) throw Error('Player profile missing');
    const data=snap.data(), failed=Array.isArray(data.failed)?data.failed:[];
    if(failed.includes(key)||(Array.isArray(data.solved)&&data.solved.includes(key))) return 0;
    const currentRating=Number.isInteger(data.rating)?data.rating:1000;
    const difference=Number(puzzleRating)-currentRating;
    const loss=Math.max(1,Math.min(5,3-Math.floor(difference/25)));
    const rating=Math.max(0,currentRating-loss);
    tx.update(ref,{rating,failed:[...failed,key],ratingHistory:history(data,currentRating,rating)});
    return currentRating-rating;
  });
}

function history(data,oldRating,newRating){
 const previous=Array.isArray(data.ratingHistory)?data.ratingHistory:[];
 return [...(previous.length?previous:[oldRating]),newRating].slice(-500);
}
