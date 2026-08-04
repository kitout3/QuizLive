// QuizLive - messages d'authentification en français et réinitialisation du mot de passe
(() => {
  'use strict';

  const messages = {
    'auth/invalid-credential': 'Adresse email ou mot de passe incorrect.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/user-not-found': 'Aucun compte ne correspond à cette adresse email.',
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/email-already-in-use': 'Cette adresse email est déjà utilisée.',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 8 caractères.',
    'auth/too-many-requests': 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
    'auth/user-disabled': 'Ce compte a été désactivé.',
    'auth/network-request-failed': 'Connexion réseau impossible. Vérifiez votre connexion Internet.',
    'auth/operation-not-allowed': 'Cette méthode de connexion n’est pas activée.',
    'auth/account-exists-with-different-credential': 'Cette adresse est déjà associée à une autre méthode de connexion.',
    'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre de connexion.',
    'auth/popup-closed-by-user': 'La connexion Google a été annulée.',
    'auth/cancelled-popup-request': 'Une connexion Google est déjà en cours.'
  };

  function friendly(error) {
    if (!error) return 'Une erreur est survenue.';
    if (messages[error.code]) return messages[error.code];
    const raw = String(error.message || '');
    if (/password|credential/i.test(raw)) return 'Adresse email ou mot de passe incorrect.';
    if (/network/i.test(raw)) return 'Connexion réseau impossible. Vérifiez votre connexion Internet.';
    return 'Authentification impossible. Vérifiez les informations saisies.';
  }

  function errorBox() {
    return document.getElementById('roleAuthError') || document.getElementById('orgAuthError');
  }

  async function resetPassword(email) {
    const value = String(email || '').trim().toLowerCase();
    if (!value) throw Object.assign(new Error('Renseignez votre adresse email.'), { code: 'quizlive/email-required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw Object.assign(new Error('Adresse email invalide.'), { code: 'auth/invalid-email' });

    firebase.auth().languageCode = 'fr';
    // Sans actionCodeSettings : évite un refus lié au domaine de retour et utilise le modèle Firebase standard.
    await firebase.auth().sendPasswordResetEmail(value);
    return true;
  }

  function install() {
    if (window.QuizOrganizer) {
      window.QuizOrganizer.authMessage = friendly;
      window.QuizOrganizer.sendPasswordReset = resetPassword;
    }

    document.addEventListener('click', async event => {
      const button = event.target.closest('#roleForgotBtn');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const email = document.getElementById('roleAuthEmail')?.value || '';
      const box = errorBox();
      if (box) box.textContent = '';
      button.disabled = true;
      const old = button.textContent;
      button.textContent = 'Envoi en cours…';
      try {
        await resetPassword(email);
        if (typeof window.showToast === 'function') {
          window.showToast('Email envoyé. Vérifiez aussi le dossier Spam ou Courrier indésirable.');
        }
        if (box) box.textContent = 'Un lien de réinitialisation a été envoyé si un compte existe avec cette adresse. Vérifiez également vos spams.';
      } catch (error) {
        if (box) box.textContent = friendly(error);
      } finally {
        button.disabled = false;
        button.textContent = old || 'Mot de passe oublié ?';
      }
    }, true);

    // Remplace tout message Firebase brut affiché dans les zones d'erreur d'authentification.
    const observer = new MutationObserver(() => {
      ['roleAuthError', 'orgAuthError'].forEach(id => {
        const node = document.getElementById(id);
        if (!node) return;
        const text = node.textContent || '';
        if (/firebase|auth\//i.test(text)) node.textContent = friendly({ message: text });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
