import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, Auth } from 'firebase/auth';
import { getAnalytics, Analytics } from "firebase/analytics";
import { getFirestore, Firestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBjzPRDijl82joMcpYurfd2OIFqnZuMP5Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tuitrix-2cd01.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tuitrix-2cd01",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tuitrix-2cd01.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "199428805375",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:199428805375:web:15d48f232bf3859c03b2ca",
  measurementId: "G-GE6KV3TFCN"
};

let app: FirebaseApp | undefined;
let analytics: Analytics | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;
let googleProvider: GoogleAuthProvider | undefined;

try {
  app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  db = getFirestore(app);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.warn("Failed to initialize Firebase:", e);
}

export { auth, db, analytics, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };
