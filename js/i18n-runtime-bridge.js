// QuizLive — pont i18n pour profil, confirmations et notifications
(() => {
  'use strict';

  const ready = () => window.QuizI18n && typeof window.QuizI18n.t === 'function';
  const tr = value => ready() ? window.QuizI18n.t(value) : value;

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  const nativePrompt = window.prompt.bind(window);
  window.alert = message => nativeAlert(tr(message));
  window.confirm = message => nativeConfirm(tr(message));
  window.prompt = (message, defaultValue) => nativePrompt(tr(message), defaultValue);

  function wrapToast() {
    if (typeof window.showToast !== 'function' || window.showToast.__qlI18nWrapped) return;
    const original = window.showToast;
    const wrapped = function(message, ...args) { return original.call(this, tr(message), ...args); };
    wrapped.__qlI18nWrapped = true;
    window.showToast = wrapped;
  }

  function bindLanguageSelect() {
    document.querySelectorAll('#settingLanguage,[data-language-select]').forEach(select => {
      if (select.dataset.qlBridgeBound) return;
      select.dataset.qlBridgeBound = '1';
      select.value = window.QuizI18n?.getLanguage?.() || 'fr';
      select.addEventListener('change', () => window.QuizI18n?.setLanguage(select.value));
    });
  }

  async function loadProfileLanguage(user) {
    if (!user || user.isAnonymous || typeof database === 'undefined') return;
    try {
      const snap = await database.ref(`organizers/${user.uid}/settings/language`).once('value');
      const lang = snap.val();
      if ((lang === 'fr' || lang === 'en') && !localStorage.getItem('quizliveLanguage')) {
        window.QuizI18n?.setLanguage(lang, { saveProfile: false });
      }
    } catch (_) {}
  }

  async function saveProfileLanguage(event) {
    if (typeof database === 'undefined') return;
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) return;
    try {
      await database.ref(`organizers/${user.uid}/settings/language`).set(event.detail.language);
    } catch (_) {}
  }

  const observer = new MutationObserver(() => { wrapToast(); bindLanguageSelect(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('quizlive:languagechange', saveProfileLanguage);
  document.addEventListener('DOMContentLoaded', () => { wrapToast(); bindLanguageSelect(); });

  if (window.firebase?.auth) firebase.auth().onAuthStateChanged(loadProfileLanguage);
})();
