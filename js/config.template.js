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

const ADMIN_UID_CONFIG = "%%FIREBASE_ADMIN_UID%%";

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

window.addEventListener('DOMContentLoaded', () => {
    const authScript = document.createElement('script');
    authScript.src = 'js/player-session-auth.js?v=3';
    authScript.onload = () => {
        const speedScoringScript = document.createElement('script');
        speedScoringScript.src = 'js/speed-scoring.js?v=3';
        document.body.appendChild(speedScoringScript);
    };
    document.body.appendChild(authScript);
});
