// Firebase Configuration - Generated at build time
const firebaseConfig = {
    apiKey: "%%FIREBASE_API_KEY%%",
    authDomain: "%%FIREBASE_AUTH_DOMAIN%%",
    databaseURL: "%%FIREBASE_DATABASE_URL%%",
    projectId: "%%FIREBASE_PROJECT_ID%%",
    storageBucket: "%%FIREBASE_STORAGE_BUCKET%%",
    messagingSenderId: "%%FIREBASE_MESSAGING_SENDER_ID%%",
    appId: "%%FIREBASE_APP_ID%%"
};

const ADMIN_UID_CONFIG = localStorage.getItem('organizerUid') || "%%FIREBASE_ADMIN_UID%%";
const PPTX_CONVERTER_URL_CONFIG = "%%PPTX_CONVERTER_URL%%";

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

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
        await loadQuizModule('js/organizer-auth.js?v=13');
        await loadQuizModule('js/google-auth-fix.js?v=13');
        await loadQuizModule('js/platform-features.js?v=13');

        if (page === 'player' || document.body.classList.contains('home-page')) {
            await loadQuizModule('js/player-session-auth.js?v=13');
            await loadQuizModule('js/participant-guard.js?v=13');
        }
        if (page === 'player' || page === 'admin') {
            await loadQuizModule('js/speed-scoring.js?v=13');
        }
        if (page === 'admin') {
            await loadQuizModule('js/participant-guard.js?v=13');
            await loadQuizModule('js/pptx-import.js?v=13');
        }
    } catch (error) {
        console.error('Erreur de chargement des modules QuizLive :', error);
    }
});
