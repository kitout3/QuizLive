// QuizLive - verrou anti double popup Google
(() => {
  'use strict';

  let googleAuthPending = false;

  function friendlyMessage(error) {
    const messages = {
      'auth/cancelled-popup-request': 'Une connexion Google est déjà en cours.',
      'auth/popup-closed-by-user': 'La fenêtre Google a été fermée avant la connexion.',
      'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre Google. Autorisez les pop-ups pour ce site.',
      'auth/unauthorized-domain': 'Ce domaine n’est pas autorisé dans Firebase Authentication.',
      'auth/operation-not-allowed': 'La connexion Google n’est pas activée dans Firebase.'
    };
    return messages[error?.code] || error?.message || 'Connexion Google impossible.';
  }

  async function saveProfile(user) {
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

  async function handleGoogleLogin(button, errorBox) {
    if (googleAuthPending) return;
    googleAuthPending = true;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Connexion Google en cours…';
    if (errorBox) errorBox.textContent = '';

    try {
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await firebase.auth().signInWithPopup(provider);
      await saveProfile(credential.user);
      if (typeof showToast === 'function') showToast('Connexion Google réussie');
      document.getElementById('organizerAccountPanel')?.classList.remove('active');
      window.location.reload();
    } catch (error) {
      console.error('Connexion Google :', error);
      if (errorBox) errorBox.textContent = friendlyMessage(error);
    } finally {
      googleAuthPending = false;
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function install() {
    const button = document.getElementById('orgGoogleBtn');
    if (!button || button.dataset.googleAuthFixed === '1') return false;

    button.dataset.googleAuthFixed = '1';
    const replacement = button.cloneNode(true);
    replacement.dataset.googleAuthFixed = '1';
    button.replaceWith(replacement);

    replacement.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      handleGoogleLogin(replacement, document.getElementById('orgAuthError'));
    });
    return true;
  }

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
