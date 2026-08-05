// QuizLive — configuration de l’envoi des e-mails de réinitialisation.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const normalizeEmail = value => String(value || '').trim().toLowerCase();

  const resetMessages = {
    'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/missing-email': 'Renseignez votre adresse e-mail.',
    'auth/user-not-found': 'Aucun compte ne correspond à cette adresse e-mail.',
    'auth/too-many-requests': 'Trop de demandes ont été effectuées. Attendez quelques minutes puis réessayez.',
    'auth/network-request-failed': 'Connexion impossible. Vérifiez votre accès à Internet.',
    'auth/unauthorized-continue-uri': 'Le domaine QuizLive doit être ajouté aux domaines autorisés dans Firebase.',
    'auth/invalid-continue-uri': 'L’adresse de retour configurée pour QuizLive est invalide.',
    'auth/expired-action-code': 'Ce lien a expiré. Demandez un nouveau lien.',
    'auth/invalid-action-code': 'Ce lien n’est plus valide. Utilisez le dernier e-mail reçu.'
  };

  function language() {
    const selected = window.QuizI18n?.getLanguage?.() || localStorage.getItem('quizliveLanguage') || document.documentElement.lang || 'fr';
    return String(selected).toLowerCase().startsWith('en') ? 'en' : 'fr';
  }

  function continueUrl() {
    return new URL('login.html?passwordReset=success', location.href).href;
  }

  async function sendPasswordReset(email) {
    const value = normalizeEmail(email);
    if (!value) throw new Error(language() === 'en' ? 'Enter your email address.' : 'Renseignez votre adresse e-mail.');

    auth.languageCode = language();

    await auth.sendPasswordResetEmail(value, {
      url: continueUrl(),
      handleCodeInApp: false
    });
  }

  function install() {
    if (!window.QuizOrganizer) return false;

    const previousAuthMessage = window.QuizOrganizer.authMessage;
    window.QuizOrganizer.sendPasswordReset = sendPasswordReset;
    window.QuizOrganizer.authMessage = error => {
      return resetMessages[error?.code]
        || previousAuthMessage?.(error)
        || error?.message
        || (language() === 'en' ? 'Unable to send the reset email.' : 'Impossible d’envoyer l’e-mail de réinitialisation.');
    };
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      if (install() || ++attempts > 100) clearInterval(timer);
    }, 50);
  }

  window.QuizLivePasswordResetMail = {
    version: '79',
    sendPasswordReset
  };
})();
