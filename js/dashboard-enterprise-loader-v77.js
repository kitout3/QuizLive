// QuizLive — charge l’espace entreprise uniquement pour un compte réellement rattaché à un groupe.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  let loaded = false;

  function redirectToOverview() {
    const url = new URL(location.href);
    if (url.searchParams.get('section') === 'organization') {
      url.searchParams.set('section', 'overview');
      history.replaceState({}, '', url);
    }

    const overview = document.querySelector('[data-section="overview"]');
    if (overview && !overview.classList.contains('active')) overview.click();
  }

  function loadEnterpriseModule() {
    if (loaded || document.querySelector('script[data-enterprise-dashboard="77"]')) return;
    loaded = true;
    const script = document.createElement('script');
    script.src = 'js/dashboard-enterprise-groups.js?v=77';
    script.dataset.enterpriseDashboard = '77';
    script.async = false;
    script.onerror = error => console.error('Chargement de l’espace entreprise impossible :', error);
    document.body.appendChild(script);
  }

  auth.onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;

    const entitlements = await window.QuizLiveEntitlements?.resolve?.(user, true);
    const visible = window.QuizLiveEntitlements?.applyEnterpriseNavigation?.(entitlements) === true;

    if (!visible) {
      redirectToOverview();
      return;
    }

    loadEnterpriseModule();
  });
})();
