// QuizLive — aligne l’affichage du tableau de bord sur les droits effectifs.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const content = document.getElementById('dashboardContent');
  const planKeys = ['free', 'pro', 'business', 'enterprise'];
  const planLabels = {
    free: { fr: 'Gratuit', en: 'Free', limit: 10 },
    pro: { fr: 'Pro', en: 'Pro', limit: 50 },
    business: { fr: 'Business', en: 'Business', limit: 200 },
    enterprise: { fr: 'Enterprise', en: 'Enterprise', limit: 500 }
  };
  let entitlements = null;
  let observer = null;
  let correcting = false;

  function lang() {
    return window.QuizI18n?.getLanguage?.() === 'en' ? 'en' : 'fr';
  }

  function currentBadgeText() {
    return lang() === 'en' ? 'Current plan' : 'Offre actuelle';
  }

  function chooseText() {
    return lang() === 'en' ? 'Choose this plan' : 'Choisir cette offre';
  }

  function startObserving() {
    if (!observer || !content) return;
    observer.observe(content, { childList: true, subtree: true, characterData: true });
  }

  function removeTechnicalSubscriptionError() {
    content?.querySelectorAll('article.dashboard-card').forEach(card => {
      const code = card.querySelector('code');
      const text = card.textContent || '';
      if (code?.textContent?.includes('subscriptions/') || text.includes('Abonnement introuvable')) {
        card.remove();
      }
    });
  }

  function makeCheckoutButton(key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-primary';
    button.dataset.checkout = key;
    button.textContent = chooseText();
    button.onclick = () => window.QuizBilling?.startCheckout?.(key);
    return button;
  }

  function correctBilling() {
    const grid = content?.querySelector('.dashboard-plan-grid');
    if (!grid || !entitlements) return;

    removeTechnicalSubscriptionError();
    const current = entitlements.effectivePlan || 'free';
    const cards = Array.from(grid.querySelectorAll('.dashboard-plan'));

    cards.forEach((card, index) => {
      const key = planKeys[index];
      if (!key) return;

      const isCurrent = key === current;
      card.classList.toggle('current', isCurrent);
      card.querySelectorAll('.dashboard-badge,[data-checkout]').forEach(element => element.remove());

      if (isCurrent) {
        const badge = document.createElement('span');
        badge.className = 'dashboard-badge';
        badge.textContent = currentBadgeText();
        card.appendChild(badge);
      } else if (key !== 'free') {
        card.appendChild(makeCheckoutButton(key));
      }
    });
  }

  function correctOverview() {
    if (!entitlements) return;
    const key = entitlements.effectivePlan || 'free';
    const plan = planLabels[key] || planLabels.free;

    content?.querySelectorAll('.dashboard-profile-line').forEach(line => {
      const label = line.querySelector('.dashboard-muted')?.textContent?.trim().toLowerCase() || '';
      if (!['abonnement', 'subscription'].includes(label)) return;
      const value = line.querySelector('strong');
      if (value) value.textContent = `${plan[lang()]} · ${plan.limit} participants`;
    });
  }

  function correctPage() {
    if (correcting || !content || !entitlements) return;
    correcting = true;
    observer?.disconnect();
    try {
      window.QuizLiveEntitlements?.applyEnterpriseNavigation?.(entitlements);
      correctBilling();
      correctOverview();
    } finally {
      correcting = false;
      startObserving();
    }
  }

  auth.onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;
    entitlements = await window.QuizLiveEntitlements?.resolve?.(user, true);

    if (!observer && content) observer = new MutationObserver(correctPage);
    correctPage();
  });

  document.addEventListener('quizlive:languagechange', correctPage);
})();
