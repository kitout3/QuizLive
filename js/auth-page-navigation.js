// QuizLive - navigation vers les pages d'authentification
(() => {
  'use strict';

  if (!document.body.classList.contains('home-page')) return;

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action !== 'login' && action !== 'signup') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    location.href = action === 'login' ? 'login.html' : 'register.html';
  }, true);

  // Ferme une éventuelle ancienne modale d'authentification restée dans le DOM.
  document.getElementById('roleAuthModal')?.remove();
})();
