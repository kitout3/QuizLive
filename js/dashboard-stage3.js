(() => {
  'use strict';

  const content = document.getElementById('dashboardContent');
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  const sidebar = document.getElementById('dashboardSidebar');
  if (!content || !title || !subtitle) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value || '').trim().replace(/[<>"'&]/g, '').slice(0, 120);
  const typeLabels = { company: 'Entreprise', school: 'École', association: 'Association' };
  let currentUser = null;
  let currentProfile = null;

  function setHeading(main, sub) {
    title.textContent = main;
    subtitle.textContent = sub;
  }

  function message(text, type = 'success') {
    if (typeof window.showToast === 'function') window.showToast(text, type);
    else {
      const box = document.createElement('div');
      box.className = `dashboard-notice ${type}`;
      box.textContent = text;
      content.prepend(box);
      setTimeout(() => box.remove(), 4000);
    }
  }

  async function refreshProfile() {
    if (!currentUser) return;
    const snap = await database.ref(`organizers/${currentUser.uid}`).once('value');
    currentProfile = snap.val() || {};
  }

  async function renderEditableProfile() {
    setHeading('Mon profil', 'Modifiez les informations visibles de votre compte organisateur.');
    await refreshProfile();
    const provider = currentUser.providerData?.[0]?.providerId || currentProfile.provider || 'password';
    content.innerHTML = `
      <article class="dashboard-card dashboard-form-card">
        <h2>Informations personnelles</h2>
        <form id="profileEditForm" class="dashboard-form">
          <div class="dashboard-field"><label for="profileDisplayName">Nom affiché</label><input id="profileDisplayName" maxlength="80" value="${esc(currentProfile.displayName || currentUser.displayName || '')}" required></div>
          <div class="dashboard-field"><label>Adresse email</label><input value="${esc(currentUser.email || currentProfile.email || '')}" disabled></div>
          <div class="dashboard-field"><label>Méthode de connexion</label><input value="${provider === 'google.com' ? 'Google' : 'Email et mot de passe'}" disabled></div>
          <button class="btn-primary" type="submit">Enregistrer les modifications</button>
        </form>
      </article>`;

    document.getElementById('profileEditForm').onsubmit = async event => {
      event.preventDefault();
      const displayName = clean(document.getElementById('profileDisplayName').value);
      if (displayName.length < 2) return message('Le nom doit contenir au moins 2 caractères.', 'error');
      try {
        await currentUser.updateProfile({ displayName });
        await database.ref(`organizers/${currentUser.uid}`).update({ displayName, updatedAt: firebase.database.ServerValue.TIMESTAMP });
        currentProfile.displayName = displayName;
        message('Profil mis à jour.');
      } catch (error) {
        message('Impossible de modifier le profil.', 'error');
      }
    };
  }

  async function loadOrganizations() {
    const snap = await database.ref(`userOrganizations/${currentUser.uid}`).once('value');
    return Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value }));
  }

  async function renderEditableOrganization() {
    setHeading('Organisation', 'Créez votre organisation et choisissez celle utilisée par défaut.');
    await refreshProfile();
    const organizations = await loadOrganizations();
    content.innerHTML = `
      <div class="dashboard-grid">
        <article class="dashboard-card">
          <h2>Mes organisations</h2>
          <div id="organizationList">${organizations.length ? organizations.map(org => `
            <label class="dashboard-choice-row">
              <input type="radio" name="defaultOrganization" value="${esc(org.id)}" ${currentProfile.defaultOrganizationId === org.id ? 'checked' : ''}>
              <span><strong>${esc(org.name || org.id)}</strong><small>${esc(typeLabels[org.type] || org.type || '')}</small></span>
              ${currentProfile.defaultOrganizationId === org.id ? '<span class="dashboard-badge">Principale</span>' : ''}
            </label>`).join('') : '<p class="dashboard-muted">Aucune organisation créée.</p>'}</div>
          ${organizations.length ? '<button id="saveDefaultOrganization" class="btn-primary" type="button">Définir comme organisation principale</button>' : ''}
        </article>
        <article class="dashboard-card dashboard-form-card">
          <h2>Créer une organisation</h2>
          <form id="createOrganizationForm" class="dashboard-form">
            <div class="dashboard-field"><label for="organizationName">Nom</label><input id="organizationName" maxlength="120" placeholder="Nom de l’entreprise, école ou association" required></div>
            <div class="dashboard-field"><label for="organizationType">Type</label><select id="organizationType"><option value="company">Entreprise</option><option value="school">École</option><option value="association">Association</option></select></div>
            <button class="btn-primary" type="submit">Créer l’organisation</button>
          </form>
        </article>
      </div>`;

    document.getElementById('saveDefaultOrganization')?.addEventListener('click', async () => {
      const selected = document.querySelector('input[name="defaultOrganization"]:checked')?.value;
      if (!selected) return message('Sélectionnez une organisation.', 'error');
      await database.ref(`organizers/${currentUser.uid}`).update({ defaultOrganizationId: selected, updatedAt: firebase.database.ServerValue.TIMESTAMP });
      message('Organisation principale mise à jour.');
      renderEditableOrganization();
    });

    document.getElementById('createOrganizationForm').onsubmit = async event => {
      event.preventDefault();
      const name = clean(document.getElementById('organizationName').value);
      const type = document.getElementById('organizationType').value;
      if (name.length < 2 || !typeLabels[type]) return message('Informations de l’organisation invalides.', 'error');
      try {
        const orgId = `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}-${Date.now().toString(36)}`;
        const data = { id: orgId, name, type, ownerUid: currentUser.uid, plan: currentProfile.plan || 'free', active: true, createdAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP };
        const updates = {};
        updates[`organizations/${orgId}`] = data;
        updates[`organizationMembers/${orgId}/${currentUser.uid}`] = { role: 'owner', joinedAt: firebase.database.ServerValue.TIMESTAMP };
        updates[`userOrganizations/${currentUser.uid}/${orgId}`] = { role: 'owner', name, type, plan: currentProfile.plan || 'free' };
        if (!currentProfile.defaultOrganizationId) updates[`organizers/${currentUser.uid}/defaultOrganizationId`] = orgId;
        await database.ref().update(updates);
        message('Organisation créée.');
        renderEditableOrganization();
      } catch (error) {
        message('Impossible de créer l’organisation.', 'error');
      }
    };
  }

  async function loadHistory() {
    const index = await database.ref(`organizerSessions/${currentUser.uid}`).once('value');
    const list = Object.entries(index.val() || {}).map(([code, value]) => ({ code, ...value }));
    list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    for (const item of list.slice(0, 100)) {
      const snap = await database.ref(`sessions/${item.code}`).once('value');
      const full = snap.val() || {};
      item.participantCount = Object.keys(full.participants || {}).length;
      item.questionCount = Array.isArray(full.questions) ? full.questions.length : Object.keys(full.questions || {}).length;
    }
    return list;
  }

  function historyCsv(items) {
    const rows = [['Code','Quiz','Date','Statut','Participants','Questions']];
    items.forEach(item => rows.push([item.code, item.name || '', item.createdAt ? new Date(Number(item.createdAt)).toLocaleString('fr-FR') : '', item.status || '', item.participantCount || 0, item.questionCount || 0]));
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quizlive-historique-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function renderHistory() {
    setHeading('Historique', 'Retrouvez toutes vos sessions et exportez leur synthèse.');
    content.innerHTML = '<div class="dashboard-loading">Chargement de l’historique…</div>';
    const items = await loadHistory();
    content.innerHTML = `
      <article class="dashboard-card">
        <div class="dashboard-toolbar"><input id="historySearch" type="search" placeholder="Rechercher un quiz ou un code"><button id="historyExport" class="btn-primary" type="button">Exporter CSV</button></div>
        <div id="historyRows"></div>
      </article>`;
    const rows = document.getElementById('historyRows');
    const draw = query => {
      const q = String(query || '').trim().toLowerCase();
      const filtered = items.filter(item => !q || String(item.name || '').toLowerCase().includes(q) || item.code.toLowerCase().includes(q));
      rows.innerHTML = filtered.length ? filtered.map(item => `<div class="dashboard-history-row"><div><strong>${esc(item.name || item.code)}</strong><small>${esc(item.code)} · ${item.createdAt ? new Date(Number(item.createdAt)).toLocaleString('fr-FR') : ''}</small></div><div class="dashboard-history-meta"><span>${item.participantCount || 0} participants</span><span>${item.questionCount || 0} éléments</span><a class="btn-primary" href="admin.html?code=${encodeURIComponent(item.code)}">Ouvrir</a></div></div>`).join('') : '<p class="dashboard-muted">Aucune session correspondante.</p>';
    };
    draw('');
    document.getElementById('historySearch').oninput = event => draw(event.target.value);
    document.getElementById('historyExport').onclick = () => historyCsv(items);
  }

  async function renderSettings() {
    setHeading('Paramètres', 'Personnalisez le comportement par défaut de votre compte.');
    await refreshProfile();
    const settings = currentProfile.settings || {};
    content.innerHTML = `
      <article class="dashboard-card dashboard-form-card">
        <h2>Préférences des nouveaux quiz</h2>
        <form id="settingsForm" class="dashboard-form">
          <label class="dashboard-toggle"><input id="settingTimer" type="checkbox" ${settings.timerEnabled !== false ? 'checked' : ''}><span>Activer le timer par défaut</span></label>
          <label class="dashboard-toggle"><input id="settingAnimations" type="checkbox" ${settings.animationsEnabled !== false ? 'checked' : ''}><span>Activer les animations par défaut</span></label>
          <label class="dashboard-toggle"><input id="settingMusic" type="checkbox" ${settings.musicEnabled === true ? 'checked' : ''}><span>Activer la musique par défaut</span></label>
          <div class="dashboard-field"><label for="settingLanguage">Langue de l’interface</label><select id="settingLanguage"><option value="fr" ${settings.language !== 'en' ? 'selected' : ''}>Français</option><option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option></select></div>
          <button class="btn-primary" type="submit">Enregistrer les paramètres</button>
        </form>
      </article>`;
    document.getElementById('settingsForm').onsubmit = async event => {
      event.preventDefault();
      const values = {
        timerEnabled: document.getElementById('settingTimer').checked,
        animationsEnabled: document.getElementById('settingAnimations').checked,
        musicEnabled: document.getElementById('settingMusic').checked,
        language: document.getElementById('settingLanguage').value
      };
      await database.ref(`organizers/${currentUser.uid}`).update({ settings: values, updatedAt: firebase.database.ServerValue.TIMESTAMP });
      message('Paramètres enregistrés.');
    };
  }

  async function activateSection(section) {
    document.querySelectorAll('.dashboard-nav-item[data-section]').forEach(button => button.classList.toggle('active', button.dataset.section === section));
    sidebar?.classList.remove('open');
    const url = new URL(location.href);
    url.searchParams.set('section', section);
    history.replaceState({}, '', url);
    try {
      if (section === 'profile') await renderEditableProfile();
      else if (section === 'organization') await renderEditableOrganization();
      else if (section === 'history') await renderHistory();
      else if (section === 'settings') await renderSettings();
    } catch (error) {
      content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Chargement impossible.')}</div>`;
    }
  }

  function bindStage3Buttons() {
    document.querySelectorAll('[data-stage3-section]').forEach(button => {
      button.onclick = () => activateSection(button.dataset.stage3Section);
    });
  }

  firebase.auth().onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    await refreshProfile();
    bindStage3Buttons();
    const requested = new URLSearchParams(location.search).get('section');
    if (['history','settings'].includes(requested)) activateSection(requested);
  });
})();
