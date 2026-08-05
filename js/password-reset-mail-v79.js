// QuizLive — envoi indépendant des e-mails de réinitialisation via Cloud Functions + Resend.
(() => {
  'use strict';

  const ENDPOINT = 'https://europe-west1-quizlive-app.cloudfunctions.net/requestPasswordReset';
  const normalizeEmail = value => String(value || '').trim().toLowerCase();

  function language() {
    const selected = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(selected).toLowerCase().startsWith('en') ? 'en' : 'fr';
  }

  function messageForStatus(status) {
    const english = language() === 'en';
    const messages = {
      400: english ? 'Enter a valid email address.' : 'Renseignez une adresse e-mail valide.',
      429: english
        ? 'A request was recently sent. Wait one minute before trying again.'
        : 'Une demande a été envoyée récemment. Attendez une minute avant de réessayer.',
      503: english
        ? 'The reset service is temporarily unavailable. Please try again later.'
        : 'Le service de réinitialisation est temporairement indisponible. Réessayez plus tard.'
    };
    return messages[status]
      || (english
        ? 'Unable to send the reset email.'
        : 'Impossible d’envoyer l’e-mail de réinitialisation.');
  }

  async function sendPasswordReset(email) {
    const value = normalizeEmail(email);
    if (!value) {
      throw new Error(language() === 'en'
        ? 'Enter your email address.'
        : 'Renseignez votre adresse e-mail.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          email: value,
          language: language(),
          website: ''
        }),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit'
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok !== true) {
        const error = new Error(result.message || messageForStatus(response.status));
        error.code = `password-reset/http-${response.status}`;
        throw error;
      }

      return result;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(language() === 'en'
          ? 'The reset service did not respond. Please try again.'
          : 'Le service de réinitialisation ne répond pas. Réessayez.');
        timeoutError.code = 'password-reset/timeout';
        throw timeoutError;
      }

      if (error instanceof TypeError) {
        const networkError = new Error(language() === 'en'
          ? 'The reset service is not deployed or cannot be reached.'
          : 'Le service de réinitialisation n’est pas encore déployé ou reste inaccessible.');
        networkError.code = 'password-reset/network';
        throw networkError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function install() {
    if (!window.QuizOrganizer) return false;

    const previousAuthMessage = window.QuizOrganizer.authMessage;
    window.QuizOrganizer.sendPasswordReset = sendPasswordReset;
    window.QuizOrganizer.authMessage = error => {
      if (String(error?.code || '').startsWith('password-reset/')) {
        return error.message;
      }

      return previousAuthMessage?.(error)
        || error?.message
        || (language() === 'en'
          ? 'Unable to send the reset email.'
          : 'Impossible d’envoyer l’e-mail de réinitialisation.');
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
    version: '80',
    endpoint: ENDPOINT,
    sendPasswordReset
  };
})();
