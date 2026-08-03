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

// Compatibilité avec l'initialisation historique d'app.js qui lit localStorage.
const tabQuizSession = sessionStorage.getItem('quizSession');
if (tabQuizSession) localStorage.setItem('quizSession', tabQuizSession);

function loadQuizModule(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    const page = document.body?.dataset?.page || '';

    try {
        if (page === 'player' || document.body.classList.contains('home-page')) {
            await loadQuizModule('js/player-session-auth.js?v=8');
            await loadQuizModule('js/participant-guard.js?v=8');
        }

        if (page === 'player' || page === 'admin') {
            await loadQuizModule('js/speed-scoring.js?v=8');
        }

        if (page === 'admin') {
            await loadQuizModule('js/participant-guard.js?v=8');
            await loadQuizModule('js/pptx-import.js?v=8');
        }
    } catch (error) {
        console.error('Erreur de chargement des modules QuizLive :', error);
    }
});