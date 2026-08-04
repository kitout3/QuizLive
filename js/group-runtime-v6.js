// QuizLive — moteur de groupes fondé uniquement sur des accès Enterprise vérifiés.
(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const state = {
    user: null,
    context: null,
    loading: null,
    accepting: false,
    repairing: false
  };

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const emailKey = email => btoa(unescape(encodeURIComponent(normalizeEmail(email))))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  function emptyContext() {
    return {
      organizationId: '',
      organization: {},
      membership: {},
      groups: [],
      isOwner: false,
      isEnterpriseMember: false
    };
  }

  function resetContext() {
    state.context = null;
    state.loading = null;
    window.QuizLiveEntitlements?.clear?.(auth.currentUser?.uid);
  }

  async function acceptPendingInvite(user) {
    if (!user?.email || state.accepting) return false;
    state.accepting = true;

    try {
      const email = normalizeEmail(user.email);
      const key = emailKey(email);
      const inviteSnap = await db.ref(`organizationEmailInvites/${key}`).once('value');
      const invite = inviteSnap.val();

      if (!invite || invite.status !== 'pending' || normalizeEmail(invite.email) !== email) {
        return false;
      }

      const now = Date.now();
      const updates = {
        [`organizationMembers/${invite.organizationId}/${user.uid}/uid`]: user.uid,
        [`organizationMembers/${invite.organizationId}/${user.uid}/email`]: email,
        [`organizationMembers/${invite.organizationId}/${user.uid}/displayName`]: user.displayName || email,
        [`organizationMembers/${invite.organizationId}/${user.uid}/role`]: 'member',
        [`organizationMembers/${invite.organizationId}/${user.uid}/groupIds/${invite.groupId}`]: true,
        [`organizationMembers/${invite.organizationId}/${user.uid}/joinedAt`]: now,
        [`organizationGroupMembers/${invite.organizationId}/${invite.groupId}/${user.uid}`]: {
          uid: user.uid,
          role: 'member',
          joinedAt: now
        },
        [`userOrganizations/${user.uid}/${invite.organizationId}/role`]: 'member',
        [`userOrganizations/${user.uid}/${invite.organizationId}/name`]: invite.organizationName || 'Entreprise',
        [`userOrganizations/${user.uid}/${invite.organizationId}/type`]: 'company',
        [`userOrganizations/${user.uid}/${invite.organizationId}/plan`]: 'enterprise',
        [`userOrganizations/${user.uid}/${invite.organizationId}/groupId`]: invite.groupId,
        [`userOrganizations/${user.uid}/${invite.organizationId}/groupName`]: invite.groupName || 'Groupe',
        [`userOrganizations/${user.uid}/${invite.organizationId}/groupIds/${invite.groupId}`]: true,
        [`organizers/${user.uid}/plan`]: 'enterprise',
        [`organizers/${user.uid}/enterpriseMember`]: true,
        [`organizers/${user.uid}/defaultOrganizationId`]: invite.organizationId,
        [`organizers/${user.uid}/updatedAt`]: now
      };

      await db.ref().update(updates);

      db.ref().update({
        [`organizationEmailInvites/${key}/status`]: 'accepted',
        [`organizationEmailInvites/${key}/acceptedBy`]: user.uid,
        [`organizationEmailInvites/${key}/acceptedAt`]: now,
        [`organizations/${invite.organizationId}/pendingInvites/${key}`]: null
      }).catch(error => console.warn('Nettoyage différé de l’invitation :', error));

      resetContext();
      window.dispatchEvent(new CustomEvent('quizlive-enterprise-membership-ready', {
        detail: { organizationId: invite.organizationId, groupId: invite.groupId }
      }));
      return true;
    } catch (error) {
      console.error('Activation du groupe Enterprise impossible :', error);
      return false;
    } finally {
      state.accepting = false;
    }
  }

  async function resolveContext(force = false) {
    const user = auth.currentUser || state.user;
    if (!user || user.isAnonymous) return emptyContext();

    state.user = user;
    if (!force && state.context) return state.context;
    if (!force && state.loading) return state.loading;

    state.loading = (async () => {
      await acceptPendingInvite(user);

      const entitlements = await window.QuizLiveEntitlements?.resolve?.(user, force);
      if (!entitlements?.hasEnterpriseWorkspace || !entitlements.organizationId || !entitlements.groups.length) {
        state.context = emptyContext();
        return state.context;
      }

      const organizationId = entitlements.organizationId;
      let organization = {
        id: organizationId,
        name: entitlements.organizationLink?.name || 'Entreprise',
        plan: 'enterprise'
      };

      try {
        const organizationSnap = await db.ref(`organizations/${organizationId}`).once('value');
        if (organizationSnap.exists()) organization = { id: organizationId, ...organizationSnap.val() };
      } catch (_) {
        // L’accès a déjà été validé par sa propre adhésion et ses groupes.
      }

      const membership = entitlements.membership || {};
      const isOwner = membership.role === 'owner' || organization.ownerUid === user.uid;
      const context = {
        organizationId,
        organization,
        membership,
        groups: entitlements.groups,
        isOwner,
        isEnterpriseMember: true
      };

      state.context = context;
      return context;
    })();

    try {
      return await state.loading;
    } catch (error) {
      console.warn('Contexte Enterprise indisponible :', error);
      state.context = emptyContext();
      return state.context;
    } finally {
      state.loading = null;
    }
  }

  async function selectedGroupContext() {
    const context = await resolveContext();
    if (!context.organizationId || !context.groups.length) return null;

    const selector = document.getElementById('quizGroupId');
    const groupId = selector?.value || context.groups[0].id;

    if (groupId === '__private__') {
      if (!context.isOwner) throw new Error('Un membre Enterprise doit créer le quiz dans un groupe.');
      return null;
    }

    const group = context.groups.find(item => item.id === groupId);
    if (!group) throw new Error('Vous n’avez pas accès à ce groupe.');

    return {
      organizationId: context.organizationId,
      organizationName: context.organization.name || 'Entreprise',
      groupId: group.id,
      groupName: group.name || 'Groupe'
    };
  }

  async function injectCreateGroupSelector() {
    const form = document.getElementById('createForm');
    if (!form) return;

    const context = await resolveContext(true);
    form.querySelector('#quizGroupField')?.remove();
    if (!context.organizationId || !context.groups.length) return;

    const field = document.createElement('div');
    field.id = 'quizGroupField';
    field.className = 'form-group';
    field.innerHTML = `
      <label for="quizGroupId">Groupe de visibilité</label>
      <select id="quizGroupId" required>
        ${context.groups.map(group => `<option value="${String(group.id).replace(/"/g, '&quot;')}">${String(group.name || 'Groupe').replace(/[<>]/g, '')}</option>`).join('')}
        ${context.isOwner ? '<option value="__private__">Quiz personnel — non partagé</option>' : ''}
      </select>
      <small style="display:block;margin-top:7px;opacity:.72">Les membres du groupe sélectionné verront et pourront modifier ce quiz.</small>`;

    form.insertBefore(field, form.querySelector('button[type="submit"]'));
    window.dispatchEvent(new CustomEvent('quizlive-group-selector-ready'));
  }

  async function repairOwnGroupSessions() {
    const user = auth.currentUser || state.user;
    if (!user || user.isAnonymous || state.repairing) return;
    state.repairing = true;

    try {
      const context = await resolveContext(true);
      if (!context.organizationId || !context.groups.length) return;

      const groupMap = new Map(context.groups.map(group => [group.id, group]));
      const ownSnap = await db.ref(`organizerSessions/${user.uid}`).once('value');
      const ownSessions = ownSnap.val() || {};
      const codes = Object.keys(ownSessions);
      if (!codes.length) return;

      const sessionSnapshots = await Promise.all(codes.map(code => db.ref(`sessions/${code}`).once('value')));
      const updates = {};

      sessionSnapshots.forEach((snapshot, index) => {
        const code = codes[index];
        const session = snapshot.val();
        if (!session || session.ownerUid !== user.uid) return;

        let organizationId = session.organizationId || ownSessions[code]?.organizationId || '';
        let groupId = session.groupId || ownSessions[code]?.groupId || '';

        if ((!organizationId || !groupId) && !context.isOwner && context.groups.length === 1) {
          organizationId = context.organizationId;
          groupId = context.groups[0].id;
        }

        if (organizationId !== context.organizationId || !groupMap.has(groupId)) return;

        const group = groupMap.get(groupId);
        const createdAt = Number(session.createdAt || ownSessions[code]?.createdAt || Date.now());
        const updatedAt = Number(session.updatedAt || ownSessions[code]?.updatedAt || createdAt);

        updates[`sessions/${code}/organizationId`] = context.organizationId;
        updates[`sessions/${code}/organizationName`] = context.organization.name || 'Entreprise';
        updates[`sessions/${code}/groupId`] = groupId;
        updates[`sessions/${code}/groupName`] = group.name || 'Groupe';
        updates[`sessions/${code}/ownerEmail`] = session.ownerEmail || user.email || '';
        updates[`organizerSessions/${user.uid}/${code}/organizationId`] = context.organizationId;
        updates[`organizerSessions/${user.uid}/${code}/groupId`] = groupId;
        updates[`organizerSessions/${user.uid}/${code}/groupName`] = group.name || 'Groupe';
        updates[`groupSessions/${context.organizationId}/${groupId}/${code}`] = {
          code,
          name: session.name || ownSessions[code]?.name || code,
          ownerUid: user.uid,
          ownerEmail: session.ownerEmail || user.email || '',
          status: session.status || ownSessions[code]?.status || 'waiting',
          createdAt,
          updatedAt
        };
      });

      if (Object.keys(updates).length) await db.ref().update(updates);
    } catch (error) {
      console.warn('Migration des quiz vers les groupes impossible :', error);
    } finally {
      state.repairing = false;
    }
  }

  async function loadSharedSessions() {
    const context = await resolveContext(true);
    if (!context.organizationId || !context.groups.length) return { context, sessions: [] };

    await repairOwnGroupSessions();

    const snapshots = await Promise.all(context.groups.map(group =>
      db.ref(`groupSessions/${context.organizationId}/${group.id}`).once('value')
    ));
    const sessions = [];

    snapshots.forEach((snapshot, index) => {
      const group = context.groups[index];
      Object.entries(snapshot.val() || {}).forEach(([code, value]) => {
        sessions.push({
          code,
          organizationId: context.organizationId,
          groupId: group.id,
          groupName: group.name || 'Groupe',
          ...value
        });
      });
    });

    const unique = Array.from(new Map(sessions.map(item => [item.code, item])).values());
    unique.sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
    return { context, sessions: unique };
  }

  async function assignSession(code, groupId) {
    const user = auth.currentUser;
    const context = await resolveContext(true);
    const group = context.groups.find(item => item.id === groupId);
    if (!user || !group) throw new Error('Groupe inaccessible.');

    const sessionSnap = await db.ref(`sessions/${code}`).once('value');
    const session = sessionSnap.val();
    if (!session) throw new Error('Quiz introuvable.');
    if (session.ownerUid !== user.uid && !context.isOwner) throw new Error('Attribution non autorisée.');

    const now = Date.now();
    const updates = {};
    if (session.organizationId && session.groupId) {
      updates[`groupSessions/${session.organizationId}/${session.groupId}/${code}`] = null;
    }

    updates[`sessions/${code}/organizationId`] = context.organizationId;
    updates[`sessions/${code}/organizationName`] = context.organization.name || 'Entreprise';
    updates[`sessions/${code}/groupId`] = group.id;
    updates[`sessions/${code}/groupName`] = group.name || 'Groupe';
    updates[`sessions/${code}/updatedAt`] = now;
    updates[`organizerSessions/${user.uid}/${code}/organizationId`] = context.organizationId;
    updates[`organizerSessions/${user.uid}/${code}/groupId`] = group.id;
    updates[`organizerSessions/${user.uid}/${code}/groupName`] = group.name || 'Groupe';
    updates[`groupSessions/${context.organizationId}/${group.id}/${code}`] = {
      code,
      name: session.name || code,
      ownerUid: session.ownerUid || user.uid,
      ownerEmail: session.ownerEmail || user.email || '',
      status: session.status || 'waiting',
      createdAt: Number(session.createdAt || now),
      updatedAt: now
    };

    await db.ref().update(updates);
  }

  async function removeAssignment(code) {
    const user = auth.currentUser;
    if (!user) throw new Error('Compte non connecté.');

    const context = await resolveContext(true);
    const sessionSnap = await db.ref(`sessions/${code}`).once('value');
    const session = sessionSnap.val();
    if (!session || (session.ownerUid !== user.uid && !context.isOwner)) {
      throw new Error('Action non autorisée.');
    }
    if (!session.organizationId || !session.groupId) return;

    const updates = {
      [`groupSessions/${session.organizationId}/${session.groupId}/${code}`]: null,
      [`sessions/${code}/organizationId`]: null,
      [`sessions/${code}/organizationName`]: null,
      [`sessions/${code}/groupId`]: null,
      [`sessions/${code}/groupName`]: null
    };

    if (session.ownerUid === user.uid) {
      updates[`organizerSessions/${user.uid}/${code}/organizationId`] = null;
      updates[`organizerSessions/${user.uid}/${code}/groupId`] = null;
      updates[`organizerSessions/${user.uid}/${code}/groupName`] = null;
    }

    await db.ref().update(updates);
  }

  auth.onAuthStateChanged(async user => {
    state.user = user && !user.isAnonymous ? user : null;
    resetContext();
    if (!state.user) return;

    await acceptPendingInvite(state.user);
    await injectCreateGroupSelector().catch(error => console.warn('Sélecteur de groupe indisponible :', error));
    await repairOwnGroupSessions();
  });

  window.addEventListener('quizlive-enterprise-membership-ready', () => {
    resetContext();
    injectCreateGroupSelector().catch(() => {});
    repairOwnGroupSessions();
  });

  window.QuizLiveGroups = {
    version: '6',
    resolveContext,
    selectedGroupContext,
    injectCreateGroupSelector,
    repairOwnGroupSessions,
    loadSharedSessions,
    assignSession,
    removeAssignment,
    acceptPendingEmailInvite: acceptPendingInvite
  };
})();
