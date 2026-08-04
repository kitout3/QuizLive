(() => {
  'use strict';

  const content = document.getElementById('dashboardContent');
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  const sidebar = document.getElementById('dashboardSidebar');
  if (!content || !title || !subtitle) return;

  const MAX_ACCOUNTS = 4;
  const MAX_GROUPS = 3;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const clean = (value, max = 120) => String(value || '').trim().replace(/[<>"'&]/g, '').slice(0, max);
  let user = null;

  function notify(text, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    const box = document.createElement('div');
    box.className = `dashboard-notice ${type}`;
    box.textContent = text;
    content.prepend(box);
    setTimeout(() => box.remove(), 4000);
  }

  function randomCode(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function profile() {
    const snap = await database.ref(`organizers/${user.uid}`).once('value');
    return snap.val() || {};
  }

  async function subscription() {
    const snap = await database.ref(`subscriptions/${user.uid}`).once('value');
    return snap.val() || {};
  }

  async function organizations() {
    const snap = await database.ref(`userOrganizations/${user.uid}`).once('value');
    return Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value }));
  }

  async function orgDetails(orgId) {
    const [orgSnap, membersSnap, groupsSnap] = await Promise.all([
      database.ref(`organizations/${orgId}`).once('value'),
      database.ref(`organizationMembers/${orgId}`).once('value'),
      database.ref(`organizationGroups/${orgId}`).once('value')
    ]);
    return {
      organization: orgSnap.val() || {},
      members: Object.entries(membersSnap.val() || {}).map(([uid, value]) => ({ uid, ...value })),
      groups: Object.entries(groupsSnap.val() || {}).map(([id, value]) => ({ id, ...value }))
    };
  }

  async function createOrganization(name) {
    const slug = clean(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
    const orgId = `${slug || 'entreprise'}-${Date.now().toString(36)}`;
    const now = firebase.database.ServerValue.TIMESTAMP;
    const data = { id: orgId, name: clean(name), type: 'company', ownerUid: user.uid, plan: 'enterprise', active: true, maxAccounts: MAX_ACCOUNTS, maxGroups: MAX_GROUPS, createdAt: now, updatedAt: now };
    const updates = {};
    updates[`organizations/${orgId}`] = data;
    updates[`organizationMembers/${orgId}/${user.uid}`] = { uid: user.uid, email: user.email || '', displayName: user.displayName || 'Propriétaire', role: 'owner', groupIds: {}, joinedAt: now };
    updates[`userOrganizations/${user.uid}/${orgId}`] = { role: 'owner', name: data.name, type: 'company', plan: 'enterprise' };
    updates[`organizers/${user.uid}/defaultOrganizationId`] = orgId;
    await database.ref().update(updates);
    return orgId;
  }

  async function createGroup(orgId, name) {
    const details = await orgDetails(orgId);
    if (details.organization.ownerUid !== user.uid) throw new Error('Seul le propriétaire peut créer un groupe.');
    if (details.groups.length >= MAX_GROUPS) throw new Error(`Limite de ${MAX_GROUPS} groupes atteinte.`);
    const groupId = database.ref(`organizationGroups/${orgId}`).push().key;
    await database.ref(`organizationGroups/${orgId}/${groupId}`).set({ id: groupId, name: clean(name), ownerUid: user.uid, active: true, createdAt: firebase.database.ServerValue.TIMESTAMP });
  }

  async function createInvite(orgId, groupId) {
    const details = await orgDetails(orgId);
    if (details.organization.ownerUid !== user.uid) throw new Error('Seul le propriétaire peut inviter un utilisateur.');
    if (details.members.length >= MAX_ACCOUNTS) throw new Error(`La limite de ${MAX_ACCOUNTS} comptes est atteinte.`);
    const group = details.groups.find(item => item.id === groupId);
    if (!group) throw new Error('Groupe introuvable.');
    let code;
    for (let i = 0; i < 20; i++) {
      code = randomCode();
      if (!(await database.ref(`organizationInvites/${code}`).once('value')).exists()) break;
    }
    await database.ref(`organizationInvites/${code}`).set({ code, organizationId: orgId, organizationName: details.organization.name, groupId, groupName: group.name, createdBy: user.uid, status: 'pending', createdAt: firebase.database.ServerValue.TIMESTAMP });
    return code;
  }

  async function acceptInvite(code) {
    const normalized = clean(code, 12).toUpperCase();
    const snap = await database.ref(`organizationInvites/${normalized}`).once('value');
    const invite = snap.val();
    if (!invite || invite.status !== 'pending') throw new Error('Code d’invitation invalide ou déjà utilisé.');
    const details = await orgDetails(invite.organizationId);
    if (details.members.length >= MAX_ACCOUNTS) throw new Error('Cette entreprise a atteint sa limite de comptes.');
    const now = firebase.database.ServerValue.TIMESTAMP;
    const updates = {};
    updates[`organizationMembers/${invite.organizationId}/${user.uid}`] = { uid: user.uid, email: user.email || '', displayName: user.displayName || user.email || 'Membre', role: 'member', groupIds: { [invite.groupId]: true }, joinedAt: now };
    updates[`organizationGroupMembers/${invite.organizationId}/${invite.groupId}/${user.uid}`] = { uid: user.uid, role: 'member', joinedAt: now };
    updates[`userOrganizations/${user.uid}/${invite.organizationId}`] = { role: 'member', name: invite.organizationName, type: 'company', plan: 'enterprise', groupId: invite.groupId, groupName: invite.groupName };
    updates[`organizationInvites/${normalized}/status`] = 'accepted';
    updates[`organizationInvites/${normalized}/acceptedBy`] = user.uid;
    updates[`organizationInvites/${normalized}/acceptedAt`] = now;
    await database.ref().update(updates);
  }

  async function removeMember(orgId, uid) {
    const details = await orgDetails(orgId);
    if (details.organization.ownerUid !== user.uid || uid === user.uid) throw new Error('Suppression non autorisée.');
    const member = details.members.find(item => item.uid === uid);
    const updates = {};
    updates[`organizationMembers/${orgId}/${uid}`] = null;
    updates[`userOrganizations/${uid}/${orgId}`] = null;
    Object.keys(member?.groupIds || {}).forEach(groupId => { updates[`organizationGroupMembers/${orgId}/${groupId}/${uid}`] = null; });
    await database.ref().update(updates);
  }

  async function renderOrganization() {
    title.textContent = 'Espace entreprise';
    subtitle.textContent = 'Gérez vos groupes et les accès de vos collaborateurs.';
    content.innerHTML = '<div class="dashboard-loading">Chargement de l’espace entreprise…</div>';

    const [profileData, subscriptionData, orgs] = await Promise.all([profile(), subscription(), organizations()]);
    const plan = subscriptionData.plan || profileData.plan || 'free';
    const selectedId = profileData.defaultOrganizationId || orgs[0]?.id || '';

    if (plan !== 'enterprise') {
      content.innerHTML = `<article class="dashboard-card enterprise-gate"><span>🏢</span><h2>Espace entreprise</h2><p>La gestion de groupes et des accès collaborateurs est disponible avec l’offre Enterprise.</p><p><strong>Enterprise : 50 €/mois · 500 participants · 4 comptes · 3 groupes</strong></p><button type="button" class="btn-primary" id="enterpriseBillingBtn">Voir l’abonnement Enterprise</button></article><article class="dashboard-card"><h2>Rejoindre une entreprise</h2><form id="joinEnterpriseForm" class="enterprise-inline-form"><input id="enterpriseInviteCode" maxlength="12" placeholder="Code d’invitation" required><button class="btn-primary">Rejoindre</button></form></article>`;
      document.getElementById('enterpriseBillingBtn').onclick = () => location.assign('dashboard.html?section=billing');
      document.getElementById('joinEnterpriseForm').onsubmit = async event => { event.preventDefault(); try { await acceptInvite(document.getElementById('enterpriseInviteCode').value); notify('Vous avez rejoint le groupe.'); renderOrganization(); } catch (error) { notify(error.message, 'error'); } };
      return;
    }

    if (!selectedId) {
      content.innerHTML = `<article class="dashboard-card enterprise-create"><h2>Créer votre espace entreprise</h2><p>Vous pourrez créer jusqu’à ${MAX_GROUPS} groupes et utiliser jusqu’à ${MAX_ACCOUNTS} comptes au total.</p><form id="createEnterpriseForm" class="enterprise-inline-form"><input id="enterpriseName" maxlength="120" placeholder="Nom de l’entreprise" required><button class="btn-primary">Créer l’espace</button></form></article><article class="dashboard-card"><h2>Rejoindre une entreprise existante</h2><form id="joinEnterpriseForm" class="enterprise-inline-form"><input id="enterpriseInviteCode" maxlength="12" placeholder="Code d’invitation" required><button class="btn-primary">Rejoindre</button></form></article>`;
      document.getElementById('createEnterpriseForm').onsubmit = async event => { event.preventDefault(); try { await createOrganization(document.getElementById('enterpriseName').value); notify('Espace entreprise créé.'); renderOrganization(); } catch (error) { notify(error.message, 'error'); } };
      document.getElementById('joinEnterpriseForm').onsubmit = async event => { event.preventDefault(); try { await acceptInvite(document.getElementById('enterpriseInviteCode').value); notify('Vous avez rejoint le groupe.'); renderOrganization(); } catch (error) { notify(error.message, 'error'); } };
      return;
    }

    const details = await orgDetails(selectedId);
    const isOwner = details.organization.ownerUid === user.uid;
    const myMembership = details.members.find(member => member.uid === user.uid) || {};
    const visibleGroups = isOwner ? details.groups : details.groups.filter(group => myMembership.groupIds?.[group.id]);

    content.innerHTML = `
      <div class="enterprise-summary">
        <article class="dashboard-stat"><strong>${details.members.length}/${MAX_ACCOUNTS}</strong><span>Comptes utilisés</span></article>
        <article class="dashboard-stat"><strong>${details.groups.length}/${MAX_GROUPS}</strong><span>Groupes créés</span></article>
        <article class="dashboard-stat"><strong>${esc(details.organization.name || 'Entreprise')}</strong><span>Organisation</span></article>
      </div>
      ${isOwner ? `<article class="dashboard-card"><div class="enterprise-heading"><div><h2>Groupes</h2><p class="dashboard-muted">Créez un espace distinct pour Communication, Marketing, Sales, etc.</p></div>${details.groups.length < MAX_GROUPS ? '<form id="createGroupForm" class="enterprise-inline-form"><input id="newGroupName" maxlength="80" placeholder="Nom du groupe" required><button class="btn-primary">Créer</button></form>' : ''}</div><div class="enterprise-groups">${details.groups.length ? details.groups.map(group => `<article class="enterprise-group-card"><h3>${esc(group.name)}</h3><p>${Object.keys((details.members.reduce((acc, m) => m.groupIds?.[group.id] ? {...acc,[m.uid]:true}:acc, {}))).length} membre(s)</p>${details.members.length < MAX_ACCOUNTS ? `<button class="btn-primary" data-invite-group="${esc(group.id)}">Générer un accès</button>` : '<span class="dashboard-badge">Limite de comptes atteinte</span>'}</article>`).join('') : '<p class="dashboard-muted">Aucun groupe créé.</p>'}</div></article>` : ''}
      <article class="dashboard-card"><h2>${isOwner ? 'Utilisateurs' : 'Mes groupes'}</h2>${isOwner ? `<div class="enterprise-member-list">${details.members.map(member => `<div class="enterprise-member-row"><div><strong>${esc(member.displayName || member.email || member.uid)}</strong><small>${esc(member.email || '')} · ${member.role === 'owner' ? 'Propriétaire' : 'Membre'}</small></div><div>${Object.keys(member.groupIds || {}).map(id => `<span class="dashboard-badge">${esc(details.groups.find(g => g.id === id)?.name || 'Groupe')}</span>`).join(' ')}${member.uid !== user.uid ? `<button class="editor-danger" data-remove-member="${esc(member.uid)}">Retirer</button>` : ''}</div></div>`).join('')}</div>` : `<div class="enterprise-groups">${visibleGroups.map(group => `<article class="enterprise-group-card"><h3>${esc(group.name)}</h3><p>Vous avez accès aux quiz, à la banque de questions et aux statistiques de ce groupe.</p></article>`).join('') || '<p class="dashboard-muted">Aucun groupe attribué.</p>'}</div>`}</article>
      <article class="dashboard-card"><h2>Rejoindre avec un autre code</h2><form id="joinEnterpriseForm" class="enterprise-inline-form"><input id="enterpriseInviteCode" maxlength="12" placeholder="Code d’invitation" required><button class="btn-primary">Rejoindre</button></form></article>`;

    document.getElementById('createGroupForm')?.addEventListener('submit', async event => { event.preventDefault(); try { await createGroup(selectedId, document.getElementById('newGroupName').value); notify('Groupe créé.'); renderOrganization(); } catch (error) { notify(error.message, 'error'); } });
    content.querySelectorAll('[data-invite-group]').forEach(button => button.onclick = async () => { try { const code = await createInvite(selectedId, button.dataset.inviteGroup); await navigator.clipboard?.writeText(code).catch(() => {}); notify(`Code d’invitation : ${code} (copié)`); button.textContent = code; } catch (error) { notify(error.message, 'error'); } });
    content.querySelectorAll('[data-remove-member]').forEach(button => button.onclick = async () => { if (!confirm('Retirer cet utilisateur de l’entreprise ?')) return; try { await removeMember(selectedId, button.dataset.removeMember); notify('Utilisateur retiré.'); renderOrganization(); } catch (error) { notify(error.message, 'error'); } });
    document.getElementById('joinEnterpriseForm').onsubmit = async event => { event.preventDefault(); try { await acceptInvite(document.getElementById('enterpriseInviteCode').value); notify('Accès ajouté.'); renderOrganization(); } catch (error) { notify(error.message, 'error'); } };
  }

  function activate() {
    document.querySelectorAll('.dashboard-nav-item').forEach(button => {
      const section = button.dataset.section || button.dataset.stage3Section;
      button.classList.toggle('active', section === 'organization');
    });
    sidebar?.classList.remove('open');
    const url = new URL(location.href); url.searchParams.set('section', 'organization'); history.replaceState({}, '', url);
    renderOrganization().catch(error => { content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Chargement impossible.')}</div>`; });
  }

  firebase.auth().onAuthStateChanged(current => {
    if (!current || current.isAnonymous) return;
    user = current;
    document.querySelectorAll('[data-section="organization"], [data-stage3-section="organization"]').forEach(button => button.onclick = activate);
    if (new URLSearchParams(location.search).get('section') === 'organization') activate();
  });
})();