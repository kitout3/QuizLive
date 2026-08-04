// QuizLive - abonnement visible uniquement dans « Mon espace »
(() => {
  'use strict';

  const plans = [
    { key: 'free', name: 'Free', price: 0, limit: 10 },
    { key: 'pro', name: 'Pro', price: 15, limit: 50 },
    { key: 'business', name: 'Business', price: 30, limit: 200 },
    { key: 'enterprise', name: 'Enterprise', price: 50, limit: 500 }
  ];

  function removeExternalBillingEntries() {
    document.querySelectorAll('[data-action="billing"], .billing-home-card, #openBillingBtn').forEach(element => {
      if (!element.closest('#quizPlatformDashboard')) element.remove();
    });
  }

  function enhanceDashboard() {
    const dashboard = document.getElementById('quizPlatformDashboard');
    const body = document.getElementById('platformDashboardBody');
    if (!dashboard || !body || !dashboard.classList.contains('active')) return;

    const headings = [...body.querySelectorAll('h3')];
    const heading = headings.find(element => element.textContent.trim().toLowerCase() === 'abonnement');
    if (!heading) return;

    let section = document.getElementById('dashboardSubscriptionSection');
    if (!section) {
      const oldGrid = heading.nextElementSibling;
      section = document.createElement('section');
      section.id = 'dashboardSubscriptionSection';
      heading.insertAdjacentElement('afterend', section);
      if (oldGrid && oldGrid !== section) oldGrid.remove();
    }

    section.innerHTML = `
      <p style="color:var(--text-secondary);margin:4px 0 14px">Toutes les offres donnent accès aux mêmes fonctionnalités. Seul le nombre maximal de participants par session change.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
        ${plans.map(plan => `<article class="action-card" style="cursor:default">
          <h3>${plan.name}</h3>
          <strong style="font-size:1.35rem">${plan.price} € / mois</strong>
          <p>Jusqu’à ${plan.limit.toLocaleString('fr-FR')} participants par session</p>
        </article>`).join('')}
      </div>
      <button type="button" id="dashboardManageSubscription" class="btn-primary" style="margin-top:16px">Gérer mon abonnement</button>`;

    section.querySelector('#dashboardManageSubscription').onclick = () => {
      window.QuizBilling?.showBilling?.();
    };
  }

  const observer = new MutationObserver(() => {
    removeExternalBillingEntries();
    enhanceDashboard();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  removeExternalBillingEntries();
  enhanceDashboard();
})();
