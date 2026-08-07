const firebaseConfig = {
  apiKey: "AIzaSyAPIW-ZlYaiRDlufkPqG7kVW_uKmhaI2kA",
  authDomain: "quizlive-app.firebaseapp.com",
  databaseURL: "https://quizlive-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quizlive-app",
  messagingSenderId: "875684500848"
};

const ADMIN_UID_CONFIG = "7DEy3WkKdQgbz7Kh7KCIrScb2el2";

const organizerApp = firebase.apps.find(app => app.name === '[DEFAULT]') || firebase.initializeApp(firebaseConfig);
const organizerDatabase = organizerApp.database();
const organizerAuth = organizerApp.auth();

const PARTICIPANT_APP_NAME = 'quizlive-participant';
const participantApp = firebase.apps.find(app => app.name === PARTICIPANT_APP_NAME)
  || firebase.initializeApp(firebaseConfig, PARTICIPANT_APP_NAME);
const participantDatabase = participantApp.database();
const participantAuth = participantApp.auth();

window.QuizLiveFirebase = {
  config: firebaseConfig,
  organizerApp,
  organizerAuth,
  organizerDatabase,
  participantApp,
  participantAuth,
  participantDatabase
};

const database = document.body?.dataset?.page === 'player'
  ? participantDatabase
  : organizerDatabase;

function loadQuizLiveScript(src, marker, readyTest) {
  if (readyTest?.()) return;
  if (document.querySelector(`script[data-quizlive-module="${marker}"]`)) return;

  const script = document.createElement('script');
  script.src = src;
  script.dataset.quizliveModule = marker;
  script.async = false;
  script.onerror = error => console.error(`Chargement du module ${marker} impossible :`, error);
  (document.body || document.head || document.documentElement).appendChild(script);
}

// Traduction globale FR / EN.
(() => {
  const version = '76';

  const loadCoverage = () => {
    if (
      window.QuizI18nCoverage?.version === version ||
      document.querySelector(`script[data-quizlive-i18n-coverage="${version}"]`)
    ) return;

    const coverage = document.createElement('script');
    coverage.src = `js/i18n-coverage-v76.js?v=${version}`;
    coverage.dataset.quizliveI18nCoverage = version;
    coverage.async = false;
    coverage.onerror = error => console.error('Chargement de la couverture de traduction QuizLive impossible :', error);
    (document.head || document.documentElement).appendChild(coverage);
  };

  if (window.QuizI18n?.version === version) {
    loadCoverage();
    return;
  }

  const existing = document.querySelector(`script[data-quizlive-i18n="${version}"]`);
  if (existing) {
    existing.addEventListener('load', loadCoverage, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = `js/i18n-complete-v76.js?v=${version}`;
  script.dataset.quizliveI18n = version;
  script.async = false;
  script.addEventListener('load', loadCoverage, { once: true });
  script.onerror = error => console.error('Chargement de la traduction QuizLive impossible :', error);
  (document.head || document.documentElement).appendChild(script);
})();

// Modules fonctionnels récents.
(() => {
  const page = document.body?.dataset?.page || '';

  const afterWindowLoad = callback => {
    if (document.readyState === 'complete') callback();
    else window.addEventListener('load', callback, { once: true });
  };

  if (page === 'admin') {
    afterWindowLoad(() => {
      loadQuizLiveScript(
        'js/pdf-slide-import-v81.js?v=83',
        'pdf-import-83',
        () => window.QuizLivePdfSlideImport?.version === '81'
      );
      loadQuizLiveScript(
        'js/image-question-v83.js?v=83',
        'image-question-83',
        () => window.QuizLiveImageQuestions?.version === '83'
      );
    });
  }

  if (page === 'player' || page === 'presenter') {
    afterWindowLoad(() => {
      loadQuizLiveScript(
        'js/image-question-v83.js?v=83',
        'image-question-83',
        () => window.QuizLiveImageQuestions?.version === '83'
      );
    });
  }

  if (page === 'dashboard') {
    loadQuizLiveScript(
      'js/dashboard-quiz-loading-v83.js?v=83',
      'quiz-loading-83',
      () => window.QuizLiveQuizLoadingGuard?.version === '83'
    );
  }
})();
