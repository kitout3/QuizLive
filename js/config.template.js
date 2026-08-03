// Firebase Configuration - Generated at build time
const firebaseConfig = {
    apiKey: "%%FIREBASE_API_KEY%%",
    authDomain: "quizlive-app.firebaseapp.com",
    databaseURL: "%%FIREBASE_DATABASE_URL%%",
    projectId: "%%FIREBASE_PROJECT_ID%%",
    storageBucket: "%%FIREBASE_STORAGE_BUCKET%%",
    messagingSenderId: "%%FIREBASE_MESSAGING_SENDER_ID%%",
    appId: "%%FIREBASE_APP_ID%%"
};

window.QUIZLIVE_FIREBASE_CONFIG = firebaseConfig;

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
        await loadQuizModule('js/organizer-auth.js?v=26');
        await loadQuizModule('js/mobile-google-auth.js?v=26');
        await loadQuizModule('js/platform-features.js?v=26');

        if (document.body.classList.contains('home-page')) {
            await loadQuizModule('js/home-role-flow.js?v=26');
        }

        await loadQuizModule('js/password-toggle.js?v=26');

        if (page === 'player' || document.body.classList.contains('home-page')) {
            await loadQuizModule('js/player-session-auth.js?v=26');
            await loadQuizModule('js/participant-guard.js?v=26');
        }
        if (page === 'player' || page === 'admin') {
            await loadQuizModule('js/speed-scoring.js?v=26');
        }
        if (page === 'admin') {
            await loadQuizModule('js/participant-guard.js?v=26');
            await loadQuizModule('js/pptx-import.js?v=26');
            await loadQuizModule('js/ai-question-generator.js?v=26');
        }

        await loadQuizModule('js/unified-runtime.js?v=26');
    } catch (error) {
        console.error('Erreur de chargement des modules QuizLive :', error);
    }
});
