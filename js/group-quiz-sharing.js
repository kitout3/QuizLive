(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  let currentUser = null;
  let contextPromise = null;
  let rendering = false;

  async function loadContext(force = false) {
    if (!currentUser) throw new Error('Compte non connecté.');
    if (contextPromise && !force) return contextPromise;

    contextPromise = (async () => {
      const [profileSnap, linksSnap] = await Promise.all([
        database.ref(`organizers/${currentUser.uid}`).once('value'),
        database.ref(`userOrganizations/${currentUser.uid}`).once('value')
      ]);
      const profile = profileSnap.val() || {};
      const links = linksSnap.val() || {};
      const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';
      if (!organizationId) return { organizationId: '', organization: {}, membership: {}, groups: [] };

      const [organizationSnap, membershipSnap, groupsSnap] = await Promise.all([
        database.ref(`organizations/${organizationId}`).once('value'),
        database.ref(`organizationMembers/${organizationId}/${currentUser.uid}`).once('value'),
        database.ref(`organizationGroups/${organizationId}`).once('value')
      ]);

      const organization = organizationSnap.val() || {};
      const membership = membershipSnap.val() || {};
      const allGroups = Object.entries(groupsSnap.val() || {}).map(([id, value]) => ({ id, ...value }));
      const isOwner = organization.ownerUid === currentUser.uid;
      const groups = isOwner
        ? allGroups
        : allGroups.filter(group => membership.groupIds?.[group.id] === true);

      return { organizationId, organization, membership, groups, isOwner };
    })();

    return contextPromise;
  }

  async function injectCreateGroupSelector() {
    const form = document.getElementById('createForm');
    if (!form || form.querySelector('#quizGroupId')) return;

    try {
      const context = await loadContext();
      if (!context.organizationId || !context.groups.length) return;

      const submit = form.querySelector('button[type="submit"]');
      const box = document.createElement('div');
      box.className = 'form-group';
      box.innerHTML = `
        <label for="quizGroupId">Groupe de visibilité</label>
        <select id="quizGroupId">
          <option value="">Quiz personnel — visible uniquement par moi</option>
          ${context.groups.map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('')}
        </select>
        <small style="display:block;margin-top:7px;opacity:.72">Un quiz attribué à un groupe sera visible par tous ses membres.</small>`;
      form.insertBefore(box, submit);
    } catch (error) {
      console.warn('Sélecteur de groupe indisponible :', error);
    }
  }

  async function selectedGroupContext() {
    const groupId = document.getElementById('quizGroupId')?.value || '';
    if (!groupId) return null;
    const context = await loadContext();
    const group = context.groups.find(item => item.id === groupId);
    if (!group) throw new Error('Vous n’avez pas accès à ce groupe.');
    return {
      organizationId: context.organizationId,
      organizationName: context.organization.name || 'Entreprise',
      groupId: group.id,
      groupName: group.name || 'Groupe'
    };
  }

  async function loadGroupSessions() {
    const context = await loadContext(true);
    if (!context.organizationId || !context.groups.length) return { context, sessions: [] };

    const snapshots = await Promise.all(context.groups.map(group =>
      database.ref(`groupSessions/${context.organizationId}/${group.id}`).once('value')
    ));

    const sessions = [];
    snapshots.forEach((snapshot, index) => {
      const group = context.groups[index];
      Object.entries(snapshot.val() || {}).forEach(([code, value]) => {
        sessions.push({ code, groupId: group.id, groupName: group.name, ...value });
      });
    });

    sessions.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
    return { context, sessions };
  }

  async function assignSession(code, groupId) {
    const context = await loadContext(true);
    const group = context.groups.find(item => item.id === groupId);
    if (!group) throw new Error('Groupe inaccessible.');

    const sessionSnap = await database.ref(`sessions/${code}`).once('value');
    const session = sessionSnap.val();
    if (!session) throw new Error('Quiz introuvable.');
    if (session.ownerUid !== currentUser.uid && !context.isOwner) throw new Error('Attribution non autorisée.');

    const now = firebase.database.ServerValue.TIMESTAMP;
    const updates = {};

    if (session.organizationId && session.groupId) {
      updates[`groupSessions/${session.organizationId}/${session.groupId}/${code}`] = null;
    }

    updates[`sessions/${code}/organizationId`] = context.organizationId;
    updates[`sessions/${code}/organizationName`] = context.organization.name || 'Entreprise';
    updates[`sessions/${code}/groupId`] = group.id;
    updates[`sessions/${code}/groupName`] = group.name || 'Groupe';
    updates[`sessions/${code}/updatedAt`] = now;
    updates[`organizerSessions/${currentUser.uid}/${code}/organizationId`] = context.organizationId;
    updates[`organizerSessions/${currentUser.uid}/${code}/groupId`] = group.id;
    updates[`organizerSessions/${currentUser.uid}/${code}/groupName`] = group.name || 'Groupe';
    updates[`groupSessions/${context.organizationId}/${group.id}/${code}`] = {
      code,
      name: session.name || code,
      ownerUid: session.ownerUid || currentUser.uid,
      ownerEmail: currentUser.email || '',
      status: session.status || 'waiting',
      createdAt: session.createdAt || now,
      updatedAt: now
    };

    await database.ref().update(updates);
  }

  async function removeAssignment(code) {
    const sessionSnap = await database.ref(`sessions/${code}`).once('value');
    const session = sessionSnap.val();
    if (!session || session.ownerUid !== currentUser.uid) throw new Error('Action non autorisée.');
    if (!session.organizationId || !session.groupId) return;

    const updates = {};
    updates[`groupSessions/${session.organizationId}/${session.groupId}/${code}`] = null;
    updates[`sessions/${code}/organizationId`] = null;
    updates[`sessions/${code}/organizationName`] = null;
    updates[`sessions/${code}/groupId`] = null;
    updates[`sessions/${code}/groupName`] = null;
    updates[`organizerSessions/${currentUser.uid}/${code}/organizationId`] = null;
    updates[`organizerSessions/${currentUser.uid}/${code}/groupId`] = null;
    updates[`organizerSessions/${currentUser.uid}/${code}/groupName`] = null;
    await database.ref().update(updates);
  }

  function notify(text, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    alert(text);
  }

  async function renderDashboardGroupQuizzes() {
    if (rendering || document.body?.dataset?.page !== 'dashboard') return;
    const title = document.getElementById('dashboardTitle');
    const content = document.getElementById('dashboardContent');
    if (!title || !content || title.textContent.trim() !== 'Mes quiz') return;

    rendering = true;
    try {
      const { context, sessions } = await loadGroupSessions();
      content.querySelector('#groupSharedQuizzes')?.remove();
      content.querySelector('#groupAssignQuizzes')?.remove();
      if (!context.organizationId || !context.groups.length) return;

      const personalRows = Array.from(content.querySelectorAll('.dashboard-row')).filter(row => row.querySelector('a[href*="admin.html?code="]'));
      const assignment = document.createElement('article');
      assignment.id = 'groupAssignQuizzes';
      assignment.className = 'dashboard-card';
      assignment.innerHTML = `
        <h2>Attribuer mes quiz à un groupe</h2>
        <p class="dashboard-muted">Choisis le groupe qui pourra voir et utiliser chaque quiz.</p>
        ${personalRows.length ? personalRows.map(row => {
          const link = row.querySelector('a[href*="admin.html?code="]');
          const code = new URL(link.href).searchParams.get('code') || '';
          const name = row.querySelector('strong')?.textContent || code;
          return `<div class="dashboard-row" data-group-assign-row="${esc(code)}"><div><strong>${esc(name)}</strong><div class="dashboard-muted">${esc(code)}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><select data-assign-code="${esc(code)}"><option value="">Choisir un groupe</option>${context.groups.map(group => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('')}</select><button type="button" class="btn-primary" data-apply-group="${esc(code)}">Attribuer</button><button type="button" data-remove-group="${esc(code)}">Privé</button></div></div>`;
        }).join('') : '<p class="dashboard-muted">Aucun quiz personnel à attribuer.</p>'}`;

      const shared = document.createElement('article');
      shared.id = 'groupSharedQuizzes';
      shared.className = 'dashboard-card';
      shared.innerHTML = `
        <div class="dashboard-row"><div><h2 style="margin:0">Quiz partagés dans mes groupes</h2><p class="dashboard-muted">Tous les membres du groupe voient les mêmes quiz.</p></div><a class="btn-primary" href="index.html?create=1">+ Créer un quiz</a></div>
        ${sessions.length ? sessions.map(session => `<div class="dashboard-row"><div><strong>${esc(session.name || session.code)}</strong><div class="dashboard-muted">${esc(session.groupName)} · ${esc(session.code)} · ${esc(session.status || 'waiting')}</div></div><a class="btn-primary" href="admin.html?code=${encodeURIComponent(session.code)}">Ouvrir</a></div>`).join('') : '<p class="dashboard-muted">Aucun quiz partagé dans vos groupes.</p>'}`;

      content.appendChild(assignment);
      content.appendChild(shared);

      assignment.querySelectorAll('[data-apply-group]').forEach(button => {
        button.onclick = async () => {
          const code = button.dataset.applyGroup;
          const select = assignment.querySelector(`[data-assign-code="${CSS.escape(code)}"]`);
          if (!select?.value) return notify('Choisis un groupe.', 'error');
          button.disabled = true;
          try {
            await assignSession(code, select.value);
            notify('Quiz attribué au groupe.');
            await renderDashboardGroupQuizzes();
          } catch (error) {
            notify(error.message || 'Attribution impossible.', 'error');
          } finally {
            button.disabled = false;
          }
        };
      });

      assignment.querySelectorAll('[data-remove-group]').forEach(button => {
        button.onclick = async () => {
          button.disabled = true;
          try {
            await removeAssignment(button.dataset.removeGroup);
            notify('Quiz redevenu personnel.');
            await renderDashboardGroupQuizzes();
          } catch (error) {
            notify(error.message || 'Modification impossible.', 'error');
          } finally {
            button.disabled = false;
          }
        };
      });
    } catch (error) {
      console.warn('Quiz de groupe indisponibles :', error);
    } finally {
      rendering = false;
    }
  }

  const observer = new MutationObserver(() => setTimeout(renderDashboardGroupQuizzes, 30));

  firebase.auth().onAuthStateChanged(user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    contextPromise = null;
    injectCreateGroupSelector();
    if (document.body?.dataset?.page === 'dashboard') {
      observer.observe(document.getElementById('dashboardContent') || document.body, { childList: true, subtree: true });
      setTimeout(renderDashboardGroupQuizzes, 50);
    }
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-section="quizzes"]')) setTimeout(renderDashboardGroupQuizzes, 100);
  });

  window.QuizLiveGroupSharing = {
    loadContext,
    selectedGroupContext,
    assignSession,
    removeAssignment,
    renderDashboardGroupQuizzes
  };
})();
