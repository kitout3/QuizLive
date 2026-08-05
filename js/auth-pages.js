// QuizLive - authentification multipage
(() => {
  'use strict';

  const page = document.body?.dataset?.authPage;
  if (!page) return;

  const errorBox = document.getElementById('authPageError');
  const successBox = document.getElementById('authPageSuccess');
  const submitButton = document.getElementById('authSubmit');
  const googleButton = document.getElementById('authGoogle');
  let resetCooldownTimer = null;

  function safeReturnUrl() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('return') || params.get('next') || sessionStorage.getItem('quizliveAuthReturn') || 'index.html';
    sessionStorage.removeItem('quizliveAuthReturn');
    try {
      const decoded = decodeURIComponent(requested);
      const target = new URL(decoded, location.href);
      if (target.origin !== location.origin || !target.pathname.startsWith('/QuizLive/')) return 'index.html';
      return `${target.pathname.split('/QuizLive/')[1] || 'index.html'}${target.search}${target.hash}`;
    } catch (_) {
      return 'index.html';
    }
  }

  const returnUrl = safeReturnUrl();
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

  function goBackToRequestedPage() {
    location.replace(returnUrl || 'index.html');
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

  function resetRequestLabel(seconds) {
    const english = window.QuizI18n?.getLanguage?.() === 'en';
    return english ? `Send again in ${seconds}s` : `Renvoyer dans ${seconds} s`;
  }

  function startResetCooldown(seconds = 60) {
    if (!submitButton) return;
    clearInterval(resetCooldownTimer);
    let remaining = seconds;
    submitButton.disabled = true;
    submitButton.textContent = resetRequestLabel(remaining);

    resetCooldownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(resetCooldownTimer);
        resetCooldownTimer = null;
        submitButton.disabled = false;
        submitButton.textContent = window.QuizI18n?.getLanguage?.() === 'en' ? 'Send a new link' : 'Envoyer un nouveau lien';
        return;
      }
      submitButton.textContent = resetRequestLabel(remaining);
    }, 1000);
  }

  async function googleAuth() {
    setError('');
    googleButton.disabled = true;
    googleButton.textContent = 'Connexion Google en cours…';
    sessionStorage.setItem('quizliveAuthReturn', returnUrl);
    try {
      const organizer = await waitForOrganizer();
      await organizer.signInWithGoogle();
      goBackToRequestedPage();
    } catch (error) {
      setError(friendly(error));
      googleButton.disabled = false;
      googleButton.textContent = 'G Continuer avec Google';
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (page === 'forgot' && resetCooldownTimer) return;

    setError('');
    setSuccess('');
    submitButton.disabled = true;

    try {
      const organizer = await waitForOrganizer();
      const email = document.getElementById('authEmail')?.value.trim() || '';
      const password = document.getElementById('authPassword')?.value || '';

      if (page === 'login') {
        await organizer.loginOrganizer(email, password);
        goBackToRequestedPage();
      } else if (page === 'register') {
        const name = document.getElementById('authName')?.value.trim() || '';
        if (!name) throw new Error('Renseignez votre nom.');
        if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
        await organizer.createOrganizer(email, password, name);
        goBackToRequestedPage();
      } else if (page === 'forgot') {
        await organizer.sendPasswordReset(email);
        setSuccess('Un seul lien vient d’être envoyé. Ouvrez le dernier e-mail reçu et vérifiez également les courriers indésirables.');
        startResetCooldown(60);
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
    if (user && !user.isAnonymous && page !== 'forgot') goBackToRequestedPage();
  });
})();
