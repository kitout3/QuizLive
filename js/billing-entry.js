// QuizLive - accès visuel à l'abonnement organisateur
(() => {
  'use strict';

  function addBillingCard() {
    if (!document.body.classList.contains('home-page')) return;
    const user = firebase.auth().currentUser;
    const cards = document.querySelector('.action-cards');
    if (!user || user.isAnonymous || !cards || cards.querySelector('[data-billing-card]')) return;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'action-card';
    card.dataset.billingCard = '1';
    card.style.cssText = 'text-align:left;width:100%;color:inherit';
    card.innerHTML = '<div class="card-icon">💳</div><h3>Abonnement</h3><p>Choisir une offre, gérer les paiements et la limite de participants</p><div class="card-arrow">→</div>';
    card.onclick = () => window.QuizBilling?.showBilling?.();
    cards.appendChild(card);
  }

  async function applyAdminLimit() {
    if (document.body?.dataset?.page !== 'admin') return;
    const code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    try {
      await window.QuizBilling?.applySessionLimit?.(code);
    } catch (error) {
      console.error('Limite abonnement:', error);
    }
  }

  firebase.auth().onAuthStateChanged(() => {
    setTimeout(addBillingCard, 150);
    setTimeout(applyAdminLimit, 250);
  });

  const cards = document.querySelector('.action-cards');
  if (cards) new MutationObserver(addBillingCard).observe(cards, { childList: true });
  setTimeout(addBillingCard, 300);
  setTimeout(applyAdminLimit, 400);
})();
