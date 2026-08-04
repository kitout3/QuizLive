(() => {
  'use strict';

  const content = document.getElementById('dashboardContent');
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  const sidebar = document.getElementById('dashboardSidebar');
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();

  if (!content || !title || !subtitle || !sidebar) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

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

  function notify(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    const box = document.createElement('div');
    box.className = `dashboard-notice ${type}`;
    box.textContent = message;
    content.prepend(box);
    setTimeout(() => box.remove(), 3500);
  }

  function normalizedPlan(value) {
    return String(value || '').trim().toLowerCase();
  }

  function activePlanKey() {
    const subscriptionPlan = normalizedPlan(organizer?.subscription?.plan);
    const profilePlan = normalizedPlan(organizer?.profile?.plan);
    const subscriptionStatus = normalizedPlan(organizer?.subscription?.status);

    if (
      plans[subscriptionPlan] &&
      !['inactive', 'canceled', 'cancelled'].includes(subscriptionStatus)
    ) {
      return subscriptionPlan;
    }

    return plans[profilePlan] ? profilePlan : 'free';
  }

  async function loadOrganizer(user) {
    const [profileSnap, subscriptionSnap] = await Promise.all([
      db.ref(`organizers/${user.uid}`).once('value'),
      db.ref(`subscriptions/${user.uid}`).once('value')
    ]);

    const profile = profileSnap.val();
    if (!profile || profile.active === false) {
      throw new Error('Compte organisateur introuvable ou inactif.');
    }

    organizer = {
      user,
      profile,
      subscription: subscriptionSnap.val() || {}
    };
  }

  async function loadSessions() {
    const snap = await db.ref(`organizerSessions/${organizer.user.uid}`).once('value');
    sessions = Object.entries(snap.val() || {})
      .map(([code, value]) => ({ code, ...value }))
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  }

  async function stats() {
    let participants = 0;
    let answers = 0;
    let correct = 0;

    for (const item of sessions.slice(0, 30)) {
      const snap = await db.ref(`sessions/${item.code}/participants`).once('value');
      const players = Object.values(snap.val() || {});
      participants += players.length;

      players.forEach(player => {
        const points = Object.values(player.answerPoints || {});
        answers += points.length;
        correct += points.filter(value => Number(value) > 0).length;
      });
    }

    return {
      participants,
      answers,
      successRate: answers ? Math.round(correct / answers * 100) : 0
    };
  }

  async function renderOverview() {
    setHeading('Vue d’ensemble', 'Suivez rapidement l’activité de votre compte QuizLive.');
    content.innerHTML = '<div class="dashboard-loading">Calcul des statistiques…</div>';

    await loadSessions();
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
        <article class="dashboard-card">
          <h2>Derniers quiz</h2>
          ${sessions.length
            ? sessions.slice(0, 5).map(session => `
                <div class="dashboard-row">
                  <div>
                    <strong>${esc(session.name || session.code)}</strong>
                    <div class="dashboard-muted">
                      ${esc(session.code)}
                      ${session.groupName ? ` · ${esc(session.groupName)}` : ''}
                    </div>
                  </div>
                  <a class="btn-primary" href="admin.html?code=${encodeURIComponent(session.code)}">Ouvrir</a>
                </div>`).join('')
            : '<p class="dashboard-muted">Aucun quiz créé.</p>'}
        </article>

        <article class="dashboard-card">
          <h2>Votre compte</h2>
          <div class="dashboard-profile-line"><span class="dashboard-muted">Organisateur</span><strong>${esc(profile.displayName || organizer.user.displayName || 'Organisateur')}</strong></div>
          <div class="dashboard-profile-line"><span class="dashboard-muted">Email</span><strong>${esc(organizer.user.email || profile.email || '')}</strong></div>
          <div class="dashboard-profile-line"><span class="dashboard-muted">Abonnement</span><strong>${plan.label} · ${plan.limit} participants</strong></div>
        </article>
      </div>`;
  }

  function quizRow(session, shared = false) {
    return `
      <div class="dashboard-row">
        <div>
          <strong>${esc(session.name || session.code)}</strong>
          <div class="dashboard-muted">
            Code ${esc(session.code)}
            ${shared ? ` · ${esc(session.groupName || 'Groupe')} · créé par ${esc(session.ownerEmail || 'un membre')}` : ''}
          </div>
        </div>
        <a class="btn-primary" href="admin.html?code=${encodeURIComponent(session.code)}">Ouvrir</a>
      </div>`;
  }

  async function renderQuizzes() {
    setHeading('Mes quiz', 'Retrouvez vos quiz personnels et ceux partagés avec vos groupes.');
    content.innerHTML = '<div class="dashboard-loading">Chargement des quiz…</div>';

    await loadSessions();

    let groupResult = {
      context: {
        organizationId: '',
        groups: [],
        isOwner: false,
        isEnterpriseMember: false
      },
      sessions: []
    };

    if (typeof window.QuizLiveGroups?.loadSharedSessions === 'function') {
      groupResult = await window.QuizLiveGroups.loadSharedSessions();
    }

    const sharedCodes = new Set(groupResult.sessions.map(session => session.code));
    const privateSessions = sessions.filter(session => !sharedCodes.has(session.code) && !session.groupId);

    const sharedCard = groupResult.context.organizationId && groupResult.context.groups.length
      ? `
        <article class="dashboard-card">
          <div class="dashboard-row">
            <div>
              <h2 style="margin:0">Quiz partagés dans mes groupes</h2>
              <p class="dashboard-muted">Tous les membres d’un même groupe voient et peuvent modifier les mêmes quiz.</p>
            </div>
            <a class="btn-primary" href="index.html?create=1">+ Créer un quiz</a>
          </div>
          ${groupResult.sessions.length
            ? groupResult.sessions.map(session => quizRow(session, true)).join('')
            : '<p class="dashboard-muted">Aucun quiz partagé dans vos groupes.</p>'}
        </article>`
      : groupResult.context.isEnterpriseMember
        ? '<article class="dashboard-card"><h2>Quiz de groupe</h2><p class="dashboard-muted">Aucun groupe ne vous est actuellement attribué.</p></article>'
        : '';

    const personalCard = `
      <article class="dashboard-card">
        <div class="dashboard-row">
          <h2 style="margin:0">Mes quiz personnels</h2>
          <a class="btn-primary" href="index.html?create=1">+ Nouveau quiz</a>
        </div>
        ${privateSessions.length
          ? privateSessions.map(session => quizRow(session, false)).join('')
          : '<p class="dashboard-muted">Aucun quiz personnel.</p>'}
      </article>`;

    const assignmentCard = groupResult.context.isOwner && groupResult.context.groups.length && privateSessions.length
      ? `
        <article class="dashboard-card" id="groupAssignmentCard">
          <h2>Partager un quiz personnel</h2>
          <p class="dashboard-muted">Attribuez un ancien quiz à un groupe pour le rendre visible aux membres.</p>
          ${privateSessions.map(session => `
            <div class="dashboard-row">
              <div><strong>${esc(session.name || session.code)}</strong><div class="dashboard-muted">${esc(session.code)}</div></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <select data-group-for="${esc(session.code)}">
                  ${groupResult.context.groups.map(group => `<option value="${esc(group.id)}">${esc(group.name || 'Groupe')}</option>`).join('')}
                </select>
                <button type="button" class="btn-primary" data-share-quiz="${esc(session.code)}">Partager</button>
              </div>
            </div>`).join('')}
        </article>`
      : '';

    content.innerHTML = `${sharedCard}${assignmentCard}${personalCard}`;

    content.querySelectorAll('[data-share-quiz]').forEach(button => {
      button.onclick = async () => {
        const code = button.dataset.shareQuiz;
        const selector = content.querySelector(`[data-group-for="${CSS.escape(code)}"]`);
        if (!selector?.value) return;

        button.disabled = true;
        try {
          await window.QuizLiveGroups.assignSession(code, selector.value);
          notify('Quiz partagé avec le groupe.');
          await renderQuizzes();
        } catch (error) {
          notify(error.message || 'Partage impossible.', 'error');
        } finally {
          button.disabled = false;
        }
      };
    });
  }

  async function renderBilling() {
    setHeading('Abonnement', 'Choisissez votre capacité maximale de participants par session.');
    const subscription = organizer.subscription || {};
    const current = activePlanKey();
    const hasSubscription = Object.keys(subscription).length > 0;

    const diagnostic = !hasSubscription
      ? `<article class="dashboard-card" style="margin-bottom:20px;border:1px solid #ef6b73"><h2>Abonnement introuvable pour ce compte</h2><code style="display:block;padding:12px;border-radius:8px;background:#0d1020;word-break:break-all">subscriptions/${esc(organizer.user.uid)}</code></article>`
      : `<article class="dashboard-card" style="margin-bottom:20px"><div class="dashboard-profile-line"><span class="dashboard-muted">Plan</span><strong>${esc(subscription.plan || 'non renseigné')}</strong></div><div class="dashboard-profile-line"><span class="dashboard-muted">Statut</span><strong>${esc(subscription.status || 'non renseigné')}</strong></div></article>`;

    content.innerHTML = `${diagnostic}<div class="dashboard-plan-grid">${Object.entries(plans).map(([key, plan]) => `
      <article class="dashboard-plan ${key === current ? 'current' : ''}">
        <h2>${plan.label}</h2>
        <div class="dashboard-plan-price">${plan.price} €<small style="font-size:14px;font-weight:500">/mois</small></div>
        <p><strong>${plan.limit}</strong> participants maximum par session</p>
        ${key === current ? '<span class="dashboard-badge">Offre actuelle</span>' : key === 'free' ? '' : `<button class="btn-primary" data-checkout="${key}">Choisir cette offre</button>`}
      </article>`).join('')}</div>`;

    content.querySelectorAll('[data-checkout]').forEach(button => {
      button.onclick = () => window.QuizBilling?.startCheckout(button.dataset.checkout);
    });
  }

  function renderProfile() {
    setHeading('Mon profil', 'Informations du compte organisateur connecté.');
    const profile = organizer.profile;

    content.innerHTML = `
      <article class="dashboard-card">
        <h2>Informations personnelles</h2>
        <div class="dashboard-profile-line"><span class="dashboard-muted">Nom</span><strong>${esc(profile.displayName || organizer.user.displayName || 'Non renseigné')}</strong></div>
        <div class="dashboard-profile-line"><span class="dashboard-muted">Adresse email</span><strong>${esc(organizer.user.email || profile.email || '')}</strong></div>
        <div class="dashboard-profile-line"><span class="dashboard-muted">UID Firebase</span><strong style="word-break:break-all">${esc(organizer.user.uid)}</strong></div>
        <div class="dashboard-profile-line"><span class="dashboard-muted">Statut</span><strong>${profile.active === false ? 'Inactif' : 'Actif'}</strong></div>
      </article>`;
  }

  async function switchSection(section) {
    if (section === 'organization') return;

    document.querySelectorAll('.dashboard-nav-item[data-section]').forEach(button => {
      button.classList.toggle('active', button.dataset.section === section);
    });
    sidebar.classList.remove('open');

    try {
      if (section === 'overview') await renderOverview();
      else if (section === 'quizzes') await renderQuizzes();
      else if (section === 'billing') await renderBilling();
      else if (section === 'profile') renderProfile();
    } catch (error) {
      console.error('Chargement du tableau de bord :', error);
      content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Chargement impossible.')}</div>`;
    }
  }

  document.querySelectorAll('[data-section]:not([data-section="organization"])').forEach(button => {
    button.onclick = () => switchSection(button.dataset.section);
  });

  document.getElementById('dashboardMenuButton').onclick = () => sidebar.classList.toggle('open');
  document.getElementById('dashboardLogout').onclick = async () => {
    await auth.signOut();
    localStorage.removeItem('organizerUid');
    localStorage.removeItem('organizerEmail');
    location.replace('index.html');
  };

  auth.onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) {
      location.replace(`login.html?return=${encodeURIComponent('dashboard.html')}`);
      return;
    }

    try {
      await window.QuizLiveGroups?.acceptPendingEmailInvite?.(user);
      await loadOrganizer(user);
      await loadSessions();

      const requested = new URLSearchParams(location.search).get('section') || 'overview';
      if (requested !== 'organization') {
        await switchSection(['overview', 'quizzes', 'billing', 'profile'].includes(requested) ? requested : 'overview');
      }
    } catch (error) {
      console.error('Initialisation du tableau de bord :', error);
      content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Impossible de charger votre espace.')}</div>`;
    }
  });
})();