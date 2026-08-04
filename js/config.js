const firebaseConfig = {
  apiKey: "AIzaSyAPIW-ZlYaiRDlufkPqG7kVW_uKmhaI2kA",
  authDomain: "quizlive-app.firebaseapp.com",
  databaseURL: "https://quizlive-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quizlive-app",
  messagingSenderId: "875684500848"
};

const ADMIN_UID_CONFIG = "7DEy3WkKdQgbz7Kh7KCIrScb2el2";

// Instance principale : comptes organisateurs (email / mot de passe).
const organizerApp = firebase.apps.find(app => app.name === '[DEFAULT]') || firebase.initializeApp(firebaseConfig);
const organizerDatabase = organizerApp.database();
const organizerAuth = organizerApp.auth();

// Instance secondaire : participants anonymes.
// Une application Firebase nommée utilise un stockage Auth distinct de l'instance
// principale. Un participant peut donc rejoindre depuis le même navigateur sans
// remplacer ni déconnecter le compte organisateur.
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

// Le code historique utilise la constante globale `database`.
// Sur la page joueur, elle doit impérativement pointer vers l'instance participante
// afin que les réponses soient écrites avec l'UID anonyme et non l'UID organisateur.
const database = document.body?.dataset?.page === 'player'
  ? participantDatabase
  : organizerDatabase;

// Charge une seule couche de traduction FR / EN sur toutes les pages utilisant config.js.
(() => {
  const version = '76';
  if (
    window.QuizI18n?.version === version ||
    document.querySelector(`script[data-quizlive-i18n="${version}"]`)
  ) {
    return;
  }

  const script = document.createElement('script');
  script.src = `js/i18n-complete-v76.js?v=${version}`;
  script.dataset.quizliveI18n = version;
  script.async = false;
  script.onerror = error => {
    console.error('Chargement de la traduction QuizLive impossible :', error);
  };

  (document.head || document.documentElement).appendChild(script);
})();
