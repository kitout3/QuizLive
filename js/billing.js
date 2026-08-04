// QuizLive - abonnements Stripe et limites de participants
(() => {
  'use strict';

  const PLAN_LIMITS = Object.freeze({
    free: 20,
    pro: 200,
    business: 1000,
    enterprise: 5000
  });

  const PLAN_LABELS = Object.freeze({
    free: 'Free',
    pro: 'Pro',
    business: 'Business',
    enterprise: 'Enterprise'
  });

  function toast(message, type = 'success') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else alert(message);
  }

  function functionsClient() {
    if (!firebase.functions) throw new Error('Le module Firebase Functions n’est pas chargé.');
    return firebase.app().functions('europe-west1');
  }

  async function subscriptionForCurrentUser() {
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) return { plan: 'free', participantLimit: PLAN_LIMITS.free, status: 'inactive' };
    const snap = await database.ref(`subscriptions/${user.uid}`).once('value');
    const value = snap.val() || {};
    const plan = PLAN_LIMITS[value.plan] ? value.plan : 'free';
    return {
      ...value,
      plan,
      participantLimit: Number(value.participantLimit) || PLAN_LIMITS[plan]
    };
  }

  async function startCheckout(plan) {
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) throw new Error('Connectez-vous avec un compte organisateur.');
      if (!['pro', 'business', 'enterprise'].includes(plan)) throw new Error('Abonnement invalide.');

      const callable = functionsClient().httpsCallable('createCheckoutSession');
      const result = await callable({ plan });
      const url = result?.data?.url;
      if (!url) throw new Error('La page de paiement n’a pas pu être créée.');
      location.assign(url);
    } catch (error) {
      console.error('Stripe Checkout:', error);
      const message = error?.message?.replace(/^Firebase:\s*/i, '') || 'Paiement impossible.';
      toast(message, 'error');
    }
  }

  async function openBillingPortal() {
    try {
      const callable = functionsClient().httpsCallable('createBillingPortalSession');
      const result = await callable({});
      const url = result?.data?.url;
      if (!url) throw new Error('Le portail de facturation est indisponible.');
      location.assign(url);
    } catch (error) {
      console.error('Stripe Portal:', error);
      toast(error?.message?.replace(/^Firebase:\s*/i, '') || 'Gestion de l’abonnement impossible.', 'error');
    }
  }

  function planCard(plan, description) {
    const limit = PLAN_LIMITS[plan];
    const isFree = plan === 'free';
    return `<article class="billing-plan-card" data-plan="${plan}" style="padding:18px;border:1px solid rgba(255,255,255,.12);border-radius:16px;display:flex;flex-direction:column;gap:10px">
      <h3 style="margin:0">${PLAN_LABELS[plan]}</h3>
      <strong>${limit.toLocaleString('fr-FR')} participant${limit > 1 ? 's' : ''} par session</strong>
      <p style="margin:0;color:var(--text-secondary)">${description}</p>
      ${isFree
        ? '<button type="button" disabled style="margin-top:auto">Plan inclus</button>'
        : `<button type="button" class="btn-primary billing-checkout" data-plan="${plan}" style="margin-top:auto">Choisir ${PLAN_LABELS[plan]}</button>`}
    </article>`;
  }

  async function showBilling() {
    const subscription = await subscriptionForCurrentUser();
    let modal = document.getElementById('billingModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'billingModal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `<div class="modal-content" style="max-width:980px;width:min(94vw,980px);max-height:90vh;overflow:auto">
      <button type="button" class="modal-close" data-close-billing>&times;</button>
      <h2>Abonnement QuizLive</h2>
      <p>Plan actuel : <strong>${PLAN_LABELS[subscription.plan]}</strong> · limite de <strong>${subscription.participantLimit.toLocaleString('fr-FR')}</strong> participants par session.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:20px">
        ${planCard('free', 'Pour tester et organiser de petits quiz.')}
        ${planCard('pro', 'Pour formations, classes et événements réguliers.')}
        ${planCard('business', 'Pour événements importants et équipes professionnelles.')}
        ${planCard('enterprise', 'Pour grands événements et besoins avancés.')}
      </div>
      ${subscription.stripeCustomerId ? '<button type="button" class="btn-primary" id="billingPortalBtn" style="margin-top:20px">Gérer mon abonnement et mes factures</button>' : ''}
    </div>`;

    modal.querySelector('[data-close-billing]').onclick = () => modal.classList.remove('active');
    modal.querySelectorAll('.billing-checkout').forEach(button => {
      button.onclick = () => startCheckout(button.dataset.plan);
    });
    modal.querySelector('#billingPortalBtn')?.addEventListener('click', openBillingPortal);
    modal.classList.add('active');
  }

  async function applySessionLimit(code) {
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous || !code) return;
    const subscription = await subscriptionForCurrentUser();
    const sessionSnap = await database.ref(`sessions/${code}`).once('value');
    const session = sessionSnap.val();
    if (!session || session.ownerUid !== user.uid) return;

    await database.ref(`sessions/${code}`).update({
      plan: subscription.plan,
      maxParticipants: subscription.participantLimit,
      subscriptionStatus: subscription.status || 'inactive'
    });
  }

  function handleBillingReturn() {
    const params = new URLSearchParams(location.search);
    if (params.get('billing') === 'success') {
      toast('Paiement validé. Votre abonnement sera activé dans quelques secondes.');
    } else if (params.get('billing') === 'cancelled') {
      toast('Paiement annulé.', 'error');
    }
  }

  window.QuizBilling = {
    PLAN_LIMITS,
    subscriptionForCurrentUser,
    startCheckout,
    openBillingPortal,
    showBilling,
    applySessionLimit
  };

  window.showBilling = showBilling;
  handleBillingReturn();
})();
