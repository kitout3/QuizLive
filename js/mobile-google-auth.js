// QuizLive - authentification Google mobile sans gestionnaire Firebase
(() => {
  'use strict';

  const GOOGLE_CLIENT_ID = '875684500848-5mpgg8bpu5obi520qr0jqc7ngvnrqej0.apps.googleusercontent.com';
  const REDIRECT_URI = 'https://kitout3.github.io/QuizLive/index.html';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);

  if (!isMobile) return;

  let signInPending = false;

  function showError(error) {
    const message = window.QuizOrganizer?.authMessage?.(error)
      || error?.message
      || 'Connexion Google impossible.';
    const box = document.getElementById('roleAuthError') || document.getElementById('orgAuthError');
    if (box) box.textContent = message;
    else if (typeof window.showToast === 'function') window.showToast(message, 'error');
  }

  function randomState() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  async function mobileGoogleSignIn() {
    if (signInPending) return;
    signInPending = true;

    const state = randomState();
    sessionStorage.setItem('quizliveGoogleOAuthState', state);
    sessionStorage.setItem('quizliveGoogleMobileReturn', '1');

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'token',
      scope: 'openid email profile',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state
    });

    // Redirection directe vers Google : aucun passage par firebaseapp.com.
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  async function finishMobileOAuth() {
    if (!location.hash || !location.hash.includes('access_token=')) return;

    const hash = new URLSearchParams(location.hash.slice(1));
    const accessToken = hash.get('access_token');
    const returnedState = hash.get('state');
    const expectedState = sessionStorage.getItem('quizliveGoogleOAuthState');
    const oauthError = hash.get('error');

    // Supprime immédiatement le jeton de l'URL visible et de l'historique.
    history.replaceState({}, document.title, REDIRECT_URI);

    try {
      if (oauthError) throw new Error(hash.get('error_description') || oauthError);
      if (!accessToken) throw new Error('Google n’a retourné aucun jeton de connexion.');
      if (!expectedState || returnedState !== expectedState) {
        throw new Error('La vérification de sécurité Google a échoué. Recommencez la connexion.');
      }

      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const credential = firebase.auth.GoogleAuthProvider.credential(null, accessToken);
      const result = await firebase.auth().signInWithCredential(credential);
      await window.QuizOrganizer?.saveOrganizerProfile?.(result.user, result.user.displayName);
      localStorage.setItem('quizliveHomeRole', 'organizer');

      sessionStorage.removeItem('quizliveGoogleOAuthState');
      sessionStorage.removeItem('quizliveGoogleMobileReturn');
      if (typeof window.showToast === 'function') window.showToast('Connexion Google réussie');
      setTimeout(() => location.replace(`${REDIRECT_URI}?google=success`), 150);
    } catch (error) {
      sessionStorage.removeItem('quizliveGoogleOAuthState');
      sessionStorage.removeItem('quizliveGoogleMobileReturn');
      showError(error);
    } finally {
      signInPending = false;
    }
  }

  function installOverride() {
    if (!window.QuizOrganizer) {
      setTimeout(installOverride, 50);
      return;
    }
    window.QuizOrganizer.signInWithGoogle = mobileGoogleSignIn;
    finishMobileOAuth();
  }

  installOverride();
})();
