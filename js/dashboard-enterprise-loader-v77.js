// QuizLive — charge l’espace entreprise uniquement pour un compte réellement rattaché à un groupe.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
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

  function loadScript(src, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-enterprise-module="${marker}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.dataset.enterpriseModule = marker;
      script.async = false;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function loadEnterpriseModules() {
    if (loaded) return;
    loaded = true;

    const modules = [
      ['js/dashboard-enterprise-groups.js?v=78', 'groups-v78'],
      ['js/enterprise-invite-form-v1.js?v=78', 'invite-form-v78'],
      ['js/enterprise-access-view.js?v=78', 'access-view-v78'],
      ['js/enterprise-delete-icons.js?v=78', 'delete-icons-v78'],
      ['js/enterprise-management-v2.js?v=78', 'management-v78']
    ];

    try {
      for (const [src, marker] of modules) {
        await loadScript(src, marker);
      }

      window.QuizLiveEnterpriseDeleteIcons?.refresh?.();
    } catch (error) {
      loaded = false;
      console.error('Chargement de l’espace entreprise impossible :', error);
    }
  }

  auth.onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;

    const entitlements = await window.QuizLiveEntitlements?.resolve?.(user, true);
    const visible = window.QuizLiveEntitlements?.applyEnterpriseNavigation?.(entitlements) === true;

    if (!visible) {
      redirectToOverview();
      return;
    }

    try {
      await db.ref(`organizers/${user.uid}`).update({
        plan: 'enterprise',
        enterpriseMember: true,
        defaultOrganizationId: entitlements.organizationId,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (error) {
      console.warn('Synchronisation du profil Enterprise impossible :', error);
    }

    await loadEnterpriseModules();
  });
})();
