// QuizLive - authentification Google adaptée aux mobiles
(() => {
  'use strict';

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

  if (!isMobile) return;

  const auth = firebase.auth();
  let redirectPending = false;

  function showError(error) {
    const message = window.QuizOrganizer?.authMessage?.(error)
      || error?.message
      || 'Connexion Google impossible.';
    const box = document.getElementById('roleAuthError') || document.getElementById('orgAuthError');
    if (box) box.textContent = message;
    else if (typeof window.showToast === 'function') window.showToast(message, 'error');
  }

  async function mobileGoogleSignIn() {
    if (redirectPending) return;
    redirectPending = true;

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      sessionStorage.setItem('quizliveGoogleMobileReturn', '1');
      sessionStorage.setItem('quizliveGoogleReturnUrl', location.href);

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithRedirect(provider);
    } catch (error) {
      redirectPending = false;
      sessionStorage.removeItem('quizliveGoogleMobileReturn');
      showError(error);
      throw error;
    }
  }

  async function finishMobileRedirect() {
    if (sessionStorage.getItem('quizliveGoogleMobileReturn') !== '1') return;

    try {
      const result = await auth.getRedirectResult();
      const user = result?.user || auth.currentUser;
      if (!user || user.isAnonymous) return;

      await window.QuizOrganizer?.saveOrganizerProfile?.(user, user.displayName);
      localStorage.setItem('quizliveHomeRole', 'organizer');
      sessionStorage.removeItem('quizliveGoogleMobileReturn');
      sessionStorage.removeItem('quizliveGoogleReturnUrl');

      if (typeof window.showToast === 'function') window.showToast('Connexion Google réussie');

      // Met à jour l'accueil sans ouvrir une seconde fenêtre.
      setTimeout(() => {
        if (location.pathname.endsWith('/index.html') || location.pathname.endsWith('/QuizLive/')) {
          location.replace(`${location.origin}${location.pathname}?google=success`);
        }
      }, 150);
    } catch (error) {
      sessionStorage.removeItem('quizliveGoogleMobileReturn');
      sessionStorage.removeItem('quizliveGoogleReturnUrl');
      showError(error);
    }
  }

  function installOverride() {
    if (!window.QuizOrganizer) {
      setTimeout(installOverride, 50);
      return;
    }
    window.QuizOrganizer.signInWithGoogle = mobileGoogleSignIn;
    finishMobileRedirect();
  }

  installOverride();
})();
