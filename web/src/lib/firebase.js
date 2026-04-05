import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAZeMHmCG1fM8JnjZUBZp8-dHUVY_g9lmU",
  authDomain: "slugs-run.firebaseapp.com",
  projectId: "slugs-run",
  storageBucket: "slugs-run.firebasestorage.app",
  messagingSenderId: "1094657124615",
  appId: "1:1094657124615:web:6d030b4fd11a4b33f13da2",
  measurementId: "G-58PCZ8WXNY"
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

export async function joinWaitlist(email) {
  const ref = collection(db, 'waitlist')
  await addDoc(ref, {
    email: email.toLowerCase().trim(),
    joinedAt: serverTimestamp(),
    source: 'slugs.run',
  })
}
