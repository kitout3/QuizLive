// Firebase Configuration - Generated at build time
// DO NOT commit real values to this file

const firebaseConfig = {
    apiKey: "%%FIREBASE_API_KEY%%",
    authDomain: "%%FIREBASE_AUTH_DOMAIN%%",
    databaseURL: "%%FIREBASE_DATABASE_URL%%",
    projectId: "%%FIREBASE_PROJECT_ID%%",
    storageBucket: "%%FIREBASE_STORAGE_BUCKET%%",
    messagingSenderId: "%%FIREBASE_MESSAGING_SENDER_ID%%",
    appId: "%%FIREBASE_APP_ID%%"
};

// Admin UID - Replace with your admin user's UID from Firebase Authentication
const ADMIN_UID_CONFIG = "%%FIREBASE_ADMIN_UID%%";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Charger le module de timer après le script principal afin qu'il puisse
// enrichir les fonctions existantes sans modifier toute l'application.
window.addEventListener('DOMContentLoaded', () => {
    const speedScoringScript = document.createElement('script');
    speedScoringScript.src = 'js/speed-scoring.js?v=1';
    speedScoringScript.defer = true;
    document.body.appendChild(speedScoringScript);
});
