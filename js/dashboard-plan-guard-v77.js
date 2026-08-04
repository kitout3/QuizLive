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

  function ensureCurrentBadge(card) {
    let badge = card.querySelector('.dashboard-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'dashboard-badge';
      card.appendChild(badge);
    }
    const text = currentBadgeText();
    if (badge.textContent !== text) badge.textContent = text;
  }

  function ensureCheckoutButton(card, key) {
    let button = card.querySelector(`[data-checkout="${key}"]`);
    card.querySelectorAll('[data-checkout]').forEach(other => {
      if (other !== button) other.remove();
    });

    if (!button) {
      button = makeCheckoutButton(key);
      card.appendChild(button);
    }

    const text = chooseText();
    if (button.textContent !== text) button.textContent = text;
    button.onclick = () => window.QuizBilling?.startCheckout?.(key);
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

      if (isCurrent) {
        card.querySelectorAll('[data-checkout]').forEach(element => element.remove());
        ensureCurrentBadge(card);
        return;
      }

      card.querySelectorAll('.dashboard-badge').forEach(element => element.remove());
      if (key === 'free') {
        card.querySelectorAll('[data-checkout]').forEach(element => element.remove());
      } else {
        ensureCheckoutButton(card, key);
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
      const expected = `${plan[lang()]} · ${plan.limit} participants`;
      if (value && value.textContent !== expected) value.textContent = expected;
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
