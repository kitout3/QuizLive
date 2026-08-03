// QuizLive - authentification Google fiable par redirection
(() => {
  'use strict';

  let redirectStarted = false;

  async function saveProfile(user) {
    if (!user) return;
    if (window.QuizOrganizer?.saveOrganizerProfile) {
      await window.QuizOrganizer.saveOrganizerProfile(user, user.displayName);
      return;
    }

    await database.ref(`organizers/${user.uid}`).update({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || '',
      role: 'organizer',
      active: true,
      provider: 'google.com',
      plan: 'free',
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  async function signInWithGoogleRedirect() {
    if (redirectStarted) return;
    redirectStarted = true;

    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    sessionStorage.setItem('quizliveGoogleRedirectPending', '1');
    return firebase.auth().signInWithRedirect(provider);
  }

  async function finishRedirect() {
    try {
      const result = await firebase.auth().getRedirectResult();
      if (result?.user) {
        await saveProfile(result.user);
        sessionStorage.removeItem('quizliveGoogleRedirectPending');
        localStorage.setItem('organizerUid', result.user.uid);
        localStorage.setItem('organizerEmail', result.user.email || '');
        if (typeof showToast === 'function') showToast('Connexion Google réussie');
      }
    } catch (error) {
      console.error('Retour connexion Google :', error);
      sessionStorage.removeItem('quizliveGoogleRedirectPending');
      window.__quizGoogleRedirectError = error;
    }
  }

  function overrideGoogleAuth() {
    if (!window.QuizOrganizer) return false;
    window.QuizOrganizer.signInWithGoogle = signInWithGoogleRedirect;
    return true;
  }

  if (!overrideGoogleAuth()) {
    const timer = setInterval(() => {
      if (overrideGoogleAuth()) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 10000);
  }

  finishRedirect();
})();
