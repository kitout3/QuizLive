// QuizLive - socle plateforme organisateur
(() => {
  'use strict';

  const TYPES = {
    company: 'Entreprise',
    school: 'École',
    association: 'Association'
  };

  const PLANS = {
    free: { name: 'Free', participants: 20, quizzes: 3 },
    pro: { name: 'Pro', participants: 200, quizzes: 50 },
    business: { name: 'Business', participants: 1000, quizzes: 500 },
    enterprise: { name: 'Enterprise', participants: null, quizzes: null }
  };

  const clean = value => String(value || '').trim().replace(/[<>"'&]/g, '').slice(0, 120);
  const slug = value => clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

  async function currentOrganizer() {
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) return null;
    const snap = await database.ref(`organizers/${user.uid}`).once('value');
    return snap.exists() ? { user, profile: snap.val() } : null;
  }

  async function createOrganization({ name, type }) {
    const organizer = await currentOrganizer();
    if (!organizer) throw new Error('Connexion organisateur requise');
    if (!TYPES[type]) throw new Error('Type d’organisation invalide');
    const orgName = clean(name);
    if (orgName.length < 2) throw new Error('Nom d’organisation requis');
    const orgId = `${slug(orgName)}-${organizer.user.uid.slice(0, 8)}-${Date.now().toString(36)}`;
    const data = { id: orgId, name: orgName, type, typeLabel: TYPES[type], ownerUid: organizer.user.uid, plan: 'free', active: true, createdAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    const updates = {};
    updates[`organizations/${orgId}`] = data;
    updates[`organizationMembers/${orgId}/${organizer.user.uid}`] = { role: 'owner', joinedAt: firebase.database.ServerValue.TIMESTAMP };
    updates[`userOrganizations/${organizer.user.uid}/${orgId}`] = { role: 'owner', name: orgName, type, plan: 'free' };
    updates[`organizers/${organizer.user.uid}/defaultOrganizationId`] = orgId;
    await database.ref().update(updates);
    return data;
  }

  async function listOrganizations() {
    const organizer = await currentOrganizer();
    if (!organizer) return [];
    const snap = await database.ref(`userOrganizations/${organizer.user.uid}`).once('value');
    return Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value }));
  }

  async function listSessions() {
    const organizer = await currentOrganizer();
    if (!organizer) return [];
    const index = await database.ref(`organizerSessions/${organizer.user.uid}`).once('value');
    return Object.entries(index.val() || {}).map(([code, value]) => ({ code, ...value })).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  async function computeStats() {
    const sessions = await listSessions();
    let participants = 0, answers = 0, correct = 0;
    for (const session of sessions.slice(0, 30)) {
      const snap = await database.ref(`sessions/${session.code}/participants`).once('value');
      const players = Object.values(snap.val() || {});
      participants += players.length;
      players.forEach(player => {
        const answerPoints = Object.values(player.answerPoints || {});
        answers += answerPoints.length;
        correct += answerPoints.filter(points => Number(points) > 0).length;
      });
    }
    return { sessions: sessions.length, participants, answers, successRate: answers ? Math.round((correct / answers) * 100) : 0 };
  }

  async function exportHistoryCsv() {
    const sessions = await listSessions();
    const lines = [['Code', 'Session', 'Date', 'Statut']];
    sessions.forEach(session => lines.push([session.code, session.name || '', session.createdAt ? new Date(Number(session.createdAt)).toLocaleString('fr-FR') : '', session.status || '']));
    const csv = lines.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quizlive-historique-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveQuestion(question) {
    const organizer = await currentOrganizer();
    if (!organizer) throw new Error('Connexion organisateur requise');
    const text = clean(question.text);
    if (!text) throw new Error('Question requise');
    const id = database.ref(`questionBanks/${organizer.user.uid}`).push().key;
    await database.ref(`questionBanks/${organizer.user.uid}/${id}`).set({ id, text, type: question.type || 'mcq', options: question.options || [], correctAnswer: Number(question.correctAnswer || 0), createdAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    return id;
  }

  function injectDashboardButton() {
    if (!document.body.classList.contains('home-page') || document.getElementById('quizPlatformDashboard')) return;
    const cards = document.querySelector('.action-cards');
    if (!cards) return;
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = '<div class="card-icon">📊</div><h3>Mon espace</h3><p>Organisations, quiz et statistiques</p><div class="card-arrow">→</div>';
    card.onclick = showDashboard;
    cards.appendChild(card);
  }

  async function showDashboard() {
    const organizer = await currentOrganizer();
    if (!organizer) {
      document.getElementById('organizerAccountPanel')?.classList.add('active');
      showToast('Connectez-vous pour ouvrir votre espace', 'error');
      return;
    }
    let modal = document.getElementById('quizPlatformDashboard');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'quizPlatformDashboard';
      modal.className = 'modal';
      modal.innerHTML = `<div class="modal-content" style="max-width:1050px;max-height:90vh;overflow:auto"><button class="modal-close" onclick="document.getElementById('quizPlatformDashboard').classList.remove('active')">&times;</button><h2>📊 Espace organisateur</h2><div id="platformDashboardBody"><p>Chargement...</p></div></div>`;
      document.body.appendChild(modal);
    }
    modal.classList.add('active');
    const [organizations, sessions, stats] = await Promise.all([listOrganizations(), listSessions(), computeStats()]);
    const body = document.getElementById('platformDashboardBody');
    body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0"><div class="action-card"><strong>${stats.sessions}</strong><p>Quiz créés</p></div><div class="action-card"><strong>${stats.participants}</strong><p>Participants</p></div><div class="action-card"><strong>${stats.answers}</strong><p>Réponses</p></div><div class="action-card"><strong>${stats.successRate}%</strong><p>Taux de réussite</p></div></div><h3>Organisation</h3><div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">${organizations.length ? organizations.map(org => `<span class="status-badge">${TYPES[org.type] || org.type} · ${org.name} · ${PLANS[org.plan || 'free'].name}</span>`).join('') : '<span style="color:var(--text-muted)">Aucune organisation</span>'}<button id="createOrganizationBtn" class="btn-primary">+ Créer une organisation</button></div><h3>Historique des quiz</h3><div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button id="exportHistoryCsvBtn" class="btn-primary">Exporter CSV</button></div><div style="max-height:260px;overflow:auto">${sessions.length ? sessions.map(s => `<div style="display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)"><span><strong>${s.name || s.code}</strong><br><small>${s.code}</small></span><a href="admin.html?code=${s.code}" class="btn-primary" style="text-decoration:none">Ouvrir</a></div>`).join('') : '<p style="color:var(--text-muted)">Aucun quiz</p>'}</div><h3 style="margin-top:22px">Abonnement</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">${Object.entries(PLANS).map(([key, plan]) => `<div class="action-card"><h3>${plan.name}</h3><p>${plan.participants ? `${plan.participants} participants / session` : 'Capacité sur mesure'}</p><small>${key === 'free' ? 'Actif par défaut' : 'Paiement à connecter'}</small></div>`).join('')}</div>`;
    document.getElementById('exportHistoryCsvBtn').onclick = exportHistoryCsv;
    document.getElementById('createOrganizationBtn').onclick = async () => {
      const name = prompt('Nom de l’organisation');
      if (!name) return;
      const type = prompt('Type : company, school ou association', 'company');
      try { await createOrganization({ name, type }); showToast('Organisation créée'); showDashboard(); } catch (error) { showToast(error.message, 'error'); }
    };
  }

  window.QuizPlatform = { createOrganization, listOrganizations, listSessions, computeStats, exportHistoryCsv, saveQuestion, showDashboard, PLANS };
  injectDashboardButton();
})();