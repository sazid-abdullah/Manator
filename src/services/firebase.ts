import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBjzPRDijl82joMcpYurfd2OIFqnZuMP5Q",
  authDomain: "tuitrix-2cd01.firebaseapp.com",
  projectId: "tuitrix-2cd01",
  storageBucket: "tuitrix-2cd01.firebasestorage.app",
  messagingSenderId: "199428805375",
  appId: "1:199428805375:web:15d48f232bf3859c03b2ca",
  measurementId: "G-GE6KV3TFCN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, analytics, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };
