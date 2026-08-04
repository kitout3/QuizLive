// QuizLive — point d’entrée de compatibilité pour la traduction globale FR / EN.
(() => {
  'use strict';

  const version = '76';

  const loadCoverage = () => {
    if (
      window.QuizI18nCoverage?.version === version ||
      document.querySelector(`script[data-quizlive-i18n-coverage="${version}"]`)
    ) {
      return;
    }

    const coverage = document.createElement('script');
    coverage.src = `js/i18n-coverage-v76.js?v=${version}`;
    coverage.dataset.quizliveI18nCoverage = version;
    coverage.async = false;
    coverage.onerror = error => {
      console.error('Chargement de la couverture de traduction QuizLive impossible :', error);
    };
    (document.head || document.documentElement).appendChild(coverage);
  };

  if (window.QuizI18n?.version === version) {
    loadCoverage();
    return;
  }

  const existing = document.querySelector(`script[data-quizlive-i18n="${version}"]`);
  if (existing) {
    existing.addEventListener('load', loadCoverage, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = `js/i18n-complete-v76.js?v=${version}`;
  script.dataset.quizliveI18n = version;
  script.async = false;
  script.addEventListener('load', loadCoverage, { once: true });
  script.onerror = error => {
    console.error('Chargement de la traduction QuizLive impossible :', error);
  };

  (document.head || document.documentElement).appendChild(script);
})();
