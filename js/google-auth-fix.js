// QuizLive - authentification Google fiable par redirection
(() => {
  'use strict';

  const PENDING_KEY = 'quizliveGoogleAuthPending';

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

  function showAuthError(message) {
    const box = document.getElementById('orgAuthError');
    if (box) box.textContent = message || '';
    else if (message && typeof showToast === 'function') showToast(message, 'error');
  }

  function friendlyMessage(error) {
    const messages = {
      'auth/popup-closed-by-user': 'La connexion Google a été interrompue.',
      'auth/cancelled-popup-request': 'Une connexion Google est déjà en cours.',
      'auth/unauthorized-domain': 'Le domaine kitout3.github.io doit être ajouté aux domaines autorisés dans Firebase Authentication.',
      'auth/operation-not-allowed': 'Le fournisseur Google doit être activé dans Firebase Authentication.',
      'auth/account-exists-with-different-credential': 'Cette adresse existe déjà avec une autre méthode de connexion.',
      'auth/network-request-failed': 'Connexion réseau impossible. Réessayez.'
    };
    return messages[error?.code] || error?.message || 'Connexion Google impossible.';
  }

  async function startGoogleRedirect(button) {
    if (sessionStorage.getItem(PENDING_KEY) === '1') return;
    sessionStorage.setItem(PENDING_KEY, '1');
    if (button) {
      button.disabled = true;
      button.textContent = 'Redirection vers Google…';
    }
    showAuthError('');
    try {
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await firebase.auth().signInWithRedirect(provider);
    } catch (error) {
      sessionStorage.removeItem(PENDING_KEY);
      if (button) {
        button.disabled = false;
        button.textContent = 'G Continuer avec Google';
      }
      showAuthError(friendlyMessage(error));
    }
  }

  async function completeRedirect() {
    try {
      const result = await firebase.auth().getRedirectResult();
      sessionStorage.removeItem(PENDING_KEY);
      if (!result?.user) return;
      await saveProfile(result.user);
      localStorage.setItem('quizliveHomeRole', 'organizer');
      if (typeof showToast === 'function') showToast('Connexion Google réussie');
      location.replace(`${location.origin}${location.pathname}`);
    } catch (error) {
      sessionStorage.removeItem(PENDING_KEY);
      showAuthError(friendlyMessage(error));
    }
  }

  function installButton() {
    const current = document.getElementById('orgGoogleBtn');
    if (!current || current.dataset.redirectAuth === '1') return false;
    const button = current.cloneNode(true);
    button.dataset.redirectAuth = '1';
    current.replaceWith(button);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startGoogleRedirect(button);
    }, true);
    return true;
  }

  completeRedirect();
  if (!installButton()) {
    const observer = new MutationObserver(() => {
      if (installButton()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 20000);
  }
})();