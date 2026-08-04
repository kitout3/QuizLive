// QuizLive — point d’entrée de compatibilité pour la traduction globale FR / EN.
(() => {
  'use strict';

  const version = '76';

  if (
    window.QuizI18n?.version === version ||
    document.querySelector(`script[data-quizlive-i18n="${version}"]`)
  ) {
    return;
  }

  const script = document.createElement('script');
  script.src = `js/i18n-complete-v76.js?v=${version}`;
  script.dataset.quizliveI18n = version;
  script.async = false;
  script.onerror = error => {
    console.error('Chargement de la traduction QuizLive impossible :', error);
  };

  (document.head || document.documentElement).appendChild(script);
})();
