// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAOcbr9slVQHhR6N96Kekt-PcBcAAZPfIY",
  authDomain: "gpcs-sro.firebaseapp.com",
  projectId: "gpcs-sro",
  storageBucket: "gpcs-sro.appspot.com",
  messagingSenderId: "650803151838",
  appId: "1:650803151838:web:3b63b9770be7517fab74f",
  measurementId: "G-H3FQ9EDMD2",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
