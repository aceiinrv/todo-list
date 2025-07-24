// Import the functions you need from the SDKs
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// PASTE YOUR FIREBASE CONFIG OBJECT HERE
const firebaseConfig = {
  apiKey: "AIzaSyAt235AjLqWDQZWmkQr2t5G2xKkTcXO9To",
  authDomain: "react-todo-app-9e865.firebaseapp.com",
  projectId: "react-todo-app-9e865",
  storageBucket: "react-todo-app-9e865.firebasestorage.app",
  messagingSenderId: "959859993016",
  appId: "1:959859993016:web:57eee1d256c24f390dc74d",
  measurementId: "G-RSF9Y5VF6D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export the firestore database instance
export const db = getFirestore(app);