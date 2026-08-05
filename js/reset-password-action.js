// QuizLive — gestionnaire personnalisé des actions e-mail Firebase.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || '';
  const actionCode = params.get('oobCode') || '';
  const requestedLanguage = String(params.get('lang') || localStorage.getItem('quizliveLanguage') || 'fr').slice(0, 2).toLowerCase();
  const language = requestedLanguage === 'en' ? 'en' : 'fr';

  const card = document.querySelector('.reset-action-card');
  const icon = document.getElementById('resetActionIcon');
  const title = document.getElementById('resetActionTitle');
  const intro = document.getElementById('resetActionIntro');
  const loading = document.getElementById('resetActionLoading');
  const form = document.getElementById('resetPasswordForm');
  const emailBox = document.getElementById('resetAccountEmail');
  const passwordInput = document.getElementById('newPassword');
  const confirmationInput = document.getElementById('confirmNewPassword');
  const lengthRule = document.getElementById('passwordLengthRule');
  const matchRule = document.getElementById('passwordMatchRule');
  const errorBox = document.getElementById('resetActionError');
  const submitButton = document.getElementById('resetPasswordSubmit');
  const result = document.getElementById('resetActionResult');
  const message = document.getElementById('resetActionMessage');
  const primaryLink = document.getElementById('resetActionPrimaryLink');
  const secondaryLink = document.getElementById('resetActionSecondaryLink');

  const copy = {
    fr: {
      resetTitle: 'Réinitialiser votre mot de passe',
      resetIntro: 'Choisissez un nouveau mot de passe sécurisé pour votre compte QuizLive.',
      invalidTitle: 'Ce lien n’est plus valide',
      invalidMessage: 'Le lien a expiré, a déjà été utilisé ou a été remplacé par une demande plus récente. Demandez un nouveau lien puis utilisez uniquement le dernier e-mail reçu.',
      successTitle: 'Mot de passe modifié',
      successMessage: 'Votre nouveau mot de passe a bien été enregistré. Vous pouvez maintenant vous connecter à QuizLive.',
      verifyTitle: 'Adresse e-mail confirmée',
      verifyMessage: 'Votre adresse e-mail a bien été vérifiée. Vous pouvez maintenant vous connecter.',
      recoverTitle: 'Adresse e-mail restaurée',
      recoverMessage: 'L’ancienne adresse e-mail du compte a bien été restaurée.',
      unsupportedTitle: 'Action non reconnue',
      unsupportedMessage: 'Ce lien ne correspond à aucune action QuizLive prise en charge.',
      shortPassword: 'Le mot de passe doit contenir au moins 8 caractères.',
      mismatch: 'Les deux mots de passe ne sont pas identiques.',
      saveError: 'Impossible d’enregistrer le nouveau mot de passe. Demandez un nouveau lien et réessayez.',
      saving: 'Enregistrement…',
      saved: 'Mot de passe enregistré',
      signIn: 'Se connecter',
      requestLink: 'Demander un nouveau lien'
    },
    en: {
      resetTitle: 'Reset your password',
      resetIntro: 'Choose a new secure password for your QuizLive account.',
      invalidTitle: 'This link is no longer valid',
      invalidMessage: 'The link has expired, has already been used, or was replaced by a more recent request. Request a new link and use only the most recent email.',
      successTitle: 'Password changed',
      successMessage: 'Your new password has been saved. You can now sign in to QuizLive.',
      verifyTitle: 'Email address verified',
      verifyMessage: 'Your email address has been verified. You can now sign in.',
      recoverTitle: 'Email address restored',
      recoverMessage: 'The previous account email address has been restored.',
      unsupportedTitle: 'Unsupported action',
      unsupportedMessage: 'This link does not match a supported QuizLive action.',
      shortPassword: 'The password must contain at least 8 characters.',
      mismatch: 'The two passwords do not match.',
      saveError: 'Unable to save the new password. Request a new link and try again.',
      saving: 'Saving…',
      saved: 'Password saved',
      signIn: 'Sign in',
      requestLink: 'Request a new link'
    }
  }[language];

  document.documentElement.lang = language;
  auth.languageCode = language;
  window.QuizI18n?.setLanguage?.(language, { saveProfile: false });

  function safeContinueUrl() {
    const raw = params.get('continueUrl') || '';
    try {
      const url = new URL(raw, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/QuizLive/')) return url.href;
    } catch (_) {}
    return new URL('login.html?passwordReset=success', location.href).href;
  }

  function setBusy(value) {
    card?.setAttribute('aria-busy', String(value));
    if (submitButton) submitButton.disabled = value;
  }

  function hideLoading() {
    if (loading) loading.hidden = true;
  }

  function showResult(kind, heading, body, showSecondary = false) {
    hideLoading();
    if (form) form.hidden = true;
    if (result) result.hidden = false;
    if (title) title.textContent = heading;
    if (intro) intro.hidden = true;
    if (message) message.textContent = body;
    if (icon) icon.textContent = kind === 'success' ? '✅' : kind === 'warning' ? '⚠️' : '❌';
    if (primaryLink) {
      primaryLink.href = kind === 'success' ? safeContinueUrl() : 'forgot-password.html';
      primaryLink.textContent = kind === 'success' ? copy.signIn : copy.requestLink;
    }
    if (secondaryLink) {
      secondaryLink.hidden = !showSecondary;
      secondaryLink.href = 'forgot-password.html';
      secondaryLink.textContent = copy.requestLink;
    }
  }

  function showInvalid() {
    showResult('error', copy.invalidTitle, copy.invalidMessage, false);
  }

  function updatePasswordRules() {
    const password = passwordInput?.value || '';
    const confirmation = confirmationInput?.value || '';
    const validLength = password.length >= 8;
    const validMatch = Boolean(password) && password === confirmation;

    if (lengthRule) {
      lengthRule.textContent = `${validLength ? '✓' : '○'} ${language === 'en' ? 'At least 8 characters' : 'Au moins 8 caractères'}`;
      lengthRule.classList.toggle('valid', validLength);
    }

    if (matchRule) {
      matchRule.textContent = `${validMatch ? '✓' : '○'} ${language === 'en' ? 'Both passwords match' : 'Les deux mots de passe sont identiques'}`;
      matchRule.classList.toggle('valid', validMatch);
    }
  }

  async function handleResetPassword() {
    if (!actionCode) {
      showInvalid();
      return;
    }

    try {
      const email = await auth.verifyPasswordResetCode(actionCode);
      hideLoading();
      title.textContent = copy.resetTitle;
      intro.textContent = copy.resetIntro;
      emailBox.textContent = email;
      form.hidden = false;
      result.hidden = true;
      passwordInput.focus();
    } catch (error) {
      console.warn('Lien de réinitialisation invalide :', error);
      showInvalid();
    }
  }

  async function handleVerifyEmail() {
    if (!actionCode) return showInvalid();
    try {
      await auth.applyActionCode(actionCode);
      showResult('success', copy.verifyTitle, copy.verifyMessage, false);
    } catch (error) {
      console.warn('Vérification e-mail impossible :', error);
      showInvalid();
    }
  }

  async function handleRecoverEmail() {
    if (!actionCode) return showInvalid();
    try {
      await auth.checkActionCode(actionCode);
      await auth.applyActionCode(actionCode);
      showResult('success', copy.recoverTitle, copy.recoverMessage, true);
    } catch (error) {
      console.warn('Restauration e-mail impossible :', error);
      showInvalid();
    }
  }

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.textContent = '';

    const password = passwordInput.value;
    const confirmation = confirmationInput.value;

    if (password.length < 8) {
      errorBox.textContent = copy.shortPassword;
      return;
    }

    if (password !== confirmation) {
      errorBox.textContent = copy.mismatch;
      return;
    }

    setBusy(true);
    submitButton.textContent = copy.saving;

    try {
      await auth.confirmPasswordReset(actionCode, password);
      submitButton.textContent = copy.saved;
      showResult('success', copy.successTitle, copy.successMessage, false);
    } catch (error) {
      console.error('Réinitialisation du mot de passe impossible :', error);
      errorBox.textContent = ['auth/expired-action-code', 'auth/invalid-action-code'].includes(error?.code)
        ? copy.invalidMessage
        : error?.code === 'auth/weak-password'
          ? copy.shortPassword
          : copy.saveError;
      submitButton.textContent = language === 'en' ? 'Save new password' : 'Enregistrer le nouveau mot de passe';
      setBusy(false);
    }
  });

  [passwordInput, confirmationInput].forEach(input => input?.addEventListener('input', updatePasswordRules));

  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.textContent = visible ? '👁' : '🙈';
      button.setAttribute('aria-label', visible
        ? (language === 'en' ? 'Show password' : 'Afficher le mot de passe')
        : (language === 'en' ? 'Hide password' : 'Masquer le mot de passe'));
    });
  });

  if (mode === 'resetPassword') handleResetPassword();
  else if (mode === 'verifyEmail') handleVerifyEmail();
  else if (mode === 'recoverEmail') handleRecoverEmail();
  else showResult('warning', copy.unsupportedTitle, copy.unsupportedMessage, false);
})();
