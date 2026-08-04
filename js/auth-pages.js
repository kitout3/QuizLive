// QuizLive - authentification multipage
(() => {
  'use strict';

  const page = document.body?.dataset?.authPage;
  if (!page) return;

  const errorBox = document.getElementById('authPageError');
  const successBox = document.getElementById('authPageSuccess');
  const submitButton = document.getElementById('authSubmit');
  const googleButton = document.getElementById('authGoogle');
  const nextUrl = new URLSearchParams(location.search).get('next') || 'index.html';

  const setError = message => { if (errorBox) errorBox.textContent = message || ''; };
  const setSuccess = message => { if (successBox) successBox.textContent = message || ''; };
  const friendly = error => window.QuizOrganizer?.authMessage?.(error) || 'Une erreur est survenue. Réessayez.';

  function waitForOrganizer() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        if (window.QuizOrganizer) {
          clearInterval(timer);
          resolve(window.QuizOrganizer);
        } else if (++attempts > 120) {
          clearInterval(timer);
          reject(new Error('Le service de connexion est indisponible.'));
        }
      }, 50);
    });
  }

  async function redirectIfConnected() {
    const user = firebase.auth().currentUser;
    if (user && !user.isAnonymous) {
      location.replace(nextUrl);
      return true;
    }
    return false;
  }

  function togglePassword() {
    const input = document.getElementById('authPassword');
    const button = document.getElementById('authEye');
    if (!input || !button) return;
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    button.textContent = visible ? '👁' : '🙈';
    button.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
  }

  async function googleAuth() {
    setError('');
    googleButton.disabled = true;
    googleButton.textContent = 'Connexion Google en cours…';
    try {
      const organizer = await waitForOrganizer();
      await organizer.signInWithGoogle();
      location.replace(nextUrl);
    } catch (error) {
      setError(friendly(error));
      googleButton.disabled = false;
      googleButton.textContent = 'G Continuer avec Google';
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    submitButton.disabled = true;

    try {
      const organizer = await waitForOrganizer();
      const email = document.getElementById('authEmail')?.value.trim() || '';
      const password = document.getElementById('authPassword')?.value || '';

      if (page === 'login') {
        await organizer.loginOrganizer(email, password);
        location.replace(nextUrl);
      } else if (page === 'register') {
        const name = document.getElementById('authName')?.value.trim() || '';
        if (!name) throw new Error('Renseignez votre nom.');
        if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        await organizer.createOrganizer(email, password, name);
        location.replace(nextUrl);
      } else if (page === 'forgot') {
        await organizer.sendPasswordReset(email);
        setSuccess('Un lien de réinitialisation a été envoyé. Vérifiez aussi les courriers indésirables.');
        submitButton.disabled = false;
      }
    } catch (error) {
      setError(friendly(error));
      submitButton.disabled = false;
    }
  }

  document.getElementById('authForm')?.addEventListener('submit', submit);
  document.getElementById('authEye')?.addEventListener('click', togglePassword);
  googleButton?.addEventListener('click', googleAuth);

  firebase.auth().onAuthStateChanged(user => {
    if (user && !user.isAnonymous && page !== 'forgot') redirectIfConnected();
  });
})();
