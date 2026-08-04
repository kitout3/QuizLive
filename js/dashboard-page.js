(() => {
  'use strict';

  const content = document.getElementById('dashboardContent');
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  const sidebar = document.getElementById('dashboardSidebar');
  if (!content || !title || !subtitle || !sidebar) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plans = {
    free: { label: 'Free', price: 0, limit: 10 },
    pro: { label: 'Pro', price: 15, limit: 50 },
    business: { label: 'Business', price: 30, limit: 200 },
    enterprise: { label: 'Enterprise', price: 50, limit: 500 }
  };

  let organizer = null;
  let sessions = [];

  function setHeading(main, sub) {
    title.textContent = main;
    subtitle.textContent = sub;
  }

  function normalizedPlan(value) {
    return String(value || '').trim().toLowerCase();
  }

  function activePlanKey() {
    const subscriptionPlan = normalizedPlan(organizer?.subscription?.plan);
    const profilePlan = normalizedPlan(organizer?.profile?.plan);
    const subscriptionStatus = normalizedPlan(organizer?.subscription?.status);
    if (plans[subscriptionPlan] && subscriptionStatus !== 'inactive' && subscriptionStatus !== 'canceled' && subscriptionStatus !== 'cancelled') return subscriptionPlan;
    return plans[profilePlan] ? profilePlan : 'free';
  }

  async function loadOrganizer(user) {
    const [profileSnap, subscriptionSnap] = await Promise.all([
      database.ref(`organizers/${user.uid}`).once('value'),
      database.ref(`subscriptions/${user.uid}`).once('value')
    ]);
    const profile = profileSnap.val();
    if (!profile || profile.active === false) throw new Error('Compte organisateur introuvable ou inactif.');
    organizer = { user, profile, subscription: subscriptionSnap.val() || {} };
  }

  async function loadSessions() {
    const snap = await database.ref(`organizerSessions/${organizer.user.uid}`).once('value');
    sessions = Object.entries(snap.val() || {})
      .map(([code, value]) => ({ code, ...value }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function stats() {
    let participants = 0;
    let answers = 0;
    let correct = 0;
    for (const item of sessions.slice(0, 30)) {
      const snap = await database.ref(`sessions/${item.code}/participants`).once('value');
      const players = Object.values(snap.val() || {});
      participants += players.length;
      players.forEach(player => {
        const points = Object.values(player.answerPoints || {});
        answers += points.length;
        correct += points.filter(value => Number(value) > 0).length;
      });
    }
    return { participants, answers, successRate: answers ? Math.round(correct / answers * 100) : 0 };
  }

  async function renderOverview() {
    setHeading('Vue d’ensemble', 'Suivez rapidement l’activité de votre compte QuizLive.');
    content.innerHTML = '<div class="dashboard-loading">Calcul des statistiques…</div>';
    const values = await stats();
    const profile = organizer.profile;
    const plan = plans[activePlanKey()];
    content.innerHTML = `
      <div class="dashboard-stats">
        <div class="dashboard-stat"><strong>${sessions.length}</strong><span>Quiz créés</span></div>
        <div class="dashboard-stat"><strong>${values.participants}</strong><span>Participants cumulés</span></div>
        <div class="dashboard-stat"><strong>${values.answers}</strong><span>Réponses enregistrées</span></div>
        <div class="dashboard-stat"><strong>${values.successRate}%</strong><span>Taux de réussite</span></div>
      </div>
      <div class="dashboard-grid">
        <article class="dashboard-card"><h2>Derniers quiz</h2>${sessions.length ? sessions.slice(0, 5).map(s => `<div class="dashboard-row"><div><strong>${esc(s.name || s.code)}</strong><div class="dashboard-muted">${esc(s.code)} · ${s.createdAt ? new Date(Number(s.createdAt)).toLocaleDateString('fr-FR') : ''}</div></div><a class="btn-primary" href="admin.html?code=${encodeURIComponent(s.code)}">Ouvrir</a></div>`).join('') : '<p class="dashboard-muted">Aucun quiz créé.</p>'}</article>
        <article class="dashboard-card"><h2>Votre compte</h2><div class="dashboard-profile-line"><span class="dashboard-muted">Organisateur</span><strong>${esc(profile.displayName || organizer.user.displayName || 'Organisateur')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Email</span><strong>${esc(organizer.user.email || profile.email || '')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Abonnement</span><strong>${plan.label} · ${plan.limit} participants</strong></div></article>
      </div>`;
  }

  function renderQuizzes() {
    setHeading('Mes quiz', 'Ouvrez et administrez les sessions rattachées à votre compte.');
    content.innerHTML = `<article class="dashboard-card"><div class="dashboard-row"><h2 style="margin:0">${sessions.length} quiz</h2><a class="btn-primary" href="index.html?create=1">+ Nouveau quiz</a></div>${sessions.length ? sessions.map(s => `<div class="dashboard-row"><div><strong>${esc(s.name || s.code)}</strong><div class="dashboard-muted">Code ${esc(s.code)} · ${esc(s.status || 'waiting')}</div></div><a class="btn-primary" href="admin.html?code=${encodeURIComponent(s.code)}">Ouvrir</a></div>`).join('') : '<p class="dashboard-muted">Aucun quiz enregistré.</p>'}</article>`;
  }

  async function renderBilling() {
    setHeading('Abonnement', 'Choisissez votre capacité maximale de participants par session.');
    const subscription = organizer.subscription || {};
    const current = activePlanKey();
    const hasSubscription = Object.keys(subscription).length > 0;
    const diagnostic = !hasSubscription
      ? `<article class="dashboard-card" style="margin-bottom:20px;border:1px solid #ef6b73"><h2>Abonnement introuvable pour ce compte</h2><p>Ajoute l’abonnement dans Firebase sous l’UID connecté ci-dessous :</p><code style="display:block;padding:12px;border-radius:8px;background:#0d1020;word-break:break-all">subscriptions/${esc(organizer.user.uid)}</code><p class="dashboard-muted">UID connecté : ${esc(organizer.user.uid)}</p></article>`
      : `<article class="dashboard-card" style="margin-bottom:20px"><div class="dashboard-profile-line"><span class="dashboard-muted">UID connecté</span><strong style="word-break:break-all">${esc(organizer.user.uid)}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Plan lu dans Firebase</span><strong>${esc(subscription.plan || 'non renseigné')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Statut</span><strong>${esc(subscription.status || 'non renseigné')}</strong></div></article>`;
    content.innerHTML = `${diagnostic}<div class="dashboard-plan-grid">${Object.entries(plans).map(([key, plan]) => `<article class="dashboard-plan ${key === current ? 'current' : ''}"><h2>${plan.label}</h2><div class="dashboard-plan-price">${plan.price} €<small style="font-size:14px;font-weight:500">/mois</small></div><p><strong>${plan.limit}</strong> participants maximum par session</p>${key === current ? '<span class="dashboard-badge">Offre actuelle</span>' : key === 'free' ? '' : `<button class="btn-primary" data-checkout="${key}">Choisir cette offre</button>`}</article>`).join('')}</div>${subscription.stripeCustomerId ? '<button class="btn-primary" id="billingPortal" style="justify-self:start">Gérer mon abonnement et mes factures</button>' : ''}`;
    content.querySelectorAll('[data-checkout]').forEach(button => button.onclick = () => window.QuizBilling?.startCheckout(button.dataset.checkout));
    document.getElementById('billingPortal')?.addEventListener('click', () => window.QuizBilling?.openBillingPortal());
  }

  function renderProfile() {
    setHeading('Mon profil', 'Informations du compte organisateur connecté.');
    const profile = organizer.profile;
    content.innerHTML = `<article class="dashboard-card"><h2>Informations personnelles</h2><div class="dashboard-profile-line"><span class="dashboard-muted">Nom</span><strong>${esc(profile.displayName || organizer.user.displayName || 'Non renseigné')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Adresse email</span><strong>${esc(organizer.user.email || profile.email || '')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">UID Firebase</span><strong style="word-break:break-all">${esc(organizer.user.uid)}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Méthode de connexion</span><strong>${esc(organizer.user.providerData?.[0]?.providerId || profile.provider || 'email')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Statut</span><strong>${profile.active === false ? 'Inactif' : 'Actif'}</strong></div></article>`;
  }

  async function switchSection(section) {
    if (section === 'organization') return;
    document.querySelectorAll('.dashboard-nav-item[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === section));
    sidebar.classList.remove('open');
    try {
      if (section === 'overview') await renderOverview();
      else if (section === 'quizzes') renderQuizzes();
      else if (section === 'billing') await renderBilling();
      else if (section === 'profile') renderProfile();
    } catch (error) {
      content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Chargement impossible.')}</div>`;
    }
  }

  document.querySelectorAll('[data-section]:not([data-section="organization"])').forEach(button => {
    button.onclick = () => switchSection(button.dataset.section);
  });
  document.getElementById('dashboardMenuButton').onclick = () => sidebar.classList.toggle('open');
  document.getElementById('dashboardLogout').onclick = async () => {
    await firebase.auth().signOut();
    localStorage.removeItem('organizerUid');
    localStorage.removeItem('organizerEmail');
    location.replace('index.html');
  };

  firebase.auth().onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) {
      location.replace(`login.html?return=${encodeURIComponent('dashboard.html')}`);
      return;
    }
    try {
      await loadOrganizer(user);
      await loadSessions();
      const requested = new URLSearchParams(location.search).get('section') || 'overview';
      if (requested !== 'organization') {
        await switchSection(['overview', 'quizzes', 'billing', 'profile'].includes(requested) ? requested : 'overview');
      }
    } catch (error) {
      content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Impossible de charger votre espace.')}</div>`;
    }
  });
})();