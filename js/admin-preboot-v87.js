// QuizLive — pré-démarrage admin v87.
// Empêche l'ancien garde mono-admin de app.js de s'exécuter avant le nouveau runtime.
(() => {
  'use strict';

  window.QuizLiveAdminBootVersion = '87';
  window.QuizLiveModernAdminBoot = true;

  if (document.body?.dataset?.page === 'admin') {
    document.body.dataset.page = 'admin-modern-pending';
  }
})();
