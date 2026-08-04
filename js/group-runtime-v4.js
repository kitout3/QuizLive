(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const state = { user: null, context: null, loading: null, accepting: false, repairing: false };

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const emailKey = email => btoa(unescape(encodeURIComponent(normalizeEmail(email))))
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  function reset() {
    state.context = null;
    state.loading = null;
  }

  async function acceptPendingInvite(user) {
    if (!user?.email || state.accepting) return false;
    state.accepting = true;

    try {
      const email = normalizeEmail(user.email);
      const key = emailKey(email);
      const snap = await db.ref(`organizationEmailInvites/${key}`).once('value');
      const invite = snap.val();
      if (!invite || invite.status !== 'pending' || normalizeEmail(invite.email) !== email) return false;

      const now = firebase.database.ServerValue.TIMESTAMP;
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
        [`organizers/${user.uid}/updatedAt`]: now,
        [`organizationEmailInvites/${key}/status`]: 'accepted',
        [`organizationEmailInvites/${key}/acceptedBy`]: user.uid,
        [`organizationEmailInvites/${key}/acceptedAt`]: now,
        [`organizations/${invite.organizationId}/pendingInvites/${key}`]: null
      };

      await db.ref().update(updates);
      reset();
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
    if (!user || user.isAnonymous) {
      return { organizationId: '', organization: {}, membership: {}, groups: [], isOwner: false, isEnterpriseMember: false };
    }

    state.user = user;
    if (!force && state.context) return state.context;
    if (!force && state.loading) return state.loading;

    state.loading = (async () => {
      await acceptPendingInvite(user);

      const [profileSnap, linksSnap] = await Promise.all([
        db.ref(`organizers/${user.uid}`).once('value'),
        db.ref(`userOrganizations/${user.uid}`).once('value')
      ]);
      const profile = profileSnap.val() || {};
      const links = linksSnap.val() || {};
      const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';

      if (!organizationId) {
        return {
          organizationId: '', organization: {}, membership: {}, groups: [], isOwner: false,
          isEnterpriseMember: profile.plan === 'enterprise' || profile.enterpriseMember === true
        };
      }

      const [organizationSnap, membershipSnap, groupsSnap] = await Promise.all([
        db.ref(`organizations/${organizationId}`).once('value'),
        db.ref(`organizationMembers/${organizationId}/${user.uid}`).once('value'),
        db.ref(`organizationGroups/${organizationId}`).once('value')
      ]);

      const organization = organizationSnap.val() || {};
      const membership = membershipSnap.val() || {};
      const allGroups = Object.entries(groupsSnap.val() || {})
        .map(([id, value]) => ({ id, ...value }))
        .filter(group => group.active !== false);
      const isOwner = organization.ownerUid === user.uid;
      const accessibleIds = new Set();

      Object.entries(membership.groupIds || {}).forEach(([groupId, enabled]) => {
        if (enabled === true) accessibleIds.add(groupId);
      });

      if (!isOwner) {
        await Promise.all(allGroups.map(async group => {
          if (accessibleIds.has(group.id)) return;
          try {
            const memberSnap = await db
              .ref(`organizationGroupMembers/${organizationId}/${group.id}/${user.uid}`)
              .once('value');
            if (memberSnap.exists()) accessibleIds.add(group.id);
          } catch (_) {
            // Un groupe non attribué doit rester illisible.
          }
        }));
      }

      const groups = isOwner ? allGroups : allGroups.filter(group => accessibleIds.has(group.id));
      const reverse = links[organizationId] || {};

      if (!isOwner && groups.length) {
        const canonical = Object.fromEntries(groups.map(group => [group.id, true]));
        const primary = groups[0];
        const repairs = {
          [`organizationMembers/${organizationId}/${user.uid}/groupIds`]: canonical,
          [`userOrganizations/${user.uid}/${organizationId}/groupIds`]: canonical,
          [`userOrganizations/${user.uid}/${organizationId}/groupId`]: primary.id,
          [`userOrganizations/${user.uid}/${organizationId}/groupName`]: primary.name || 'Groupe'
        };
        db.ref().update(repairs).catch(error => console.warn('Synchronisation des groupes impossible :', error));
      }

      const context = {
        organizationId,
        organization,
        membership,
        groups,
        isOwner,
        isEnterpriseMember: organization.plan === 'enterprise' || reverse.plan === 'enterprise' ||
          profile.plan === 'enterprise' || profile.enterpriseMember === true
      };
      state.context = context;
      return context;
    })();

    try {
      return await state.loading;
    } finally {
      state.loading = null;
    }
  }

  async function selectedGroupContext() {
    const context = await resolveContext();
    if (!context.organizationId || !context.groups.length) {
      if (context.isEnterpriseMember && !context.isOwner) {
        throw new Error('Aucun groupe Enterprise ne vous est attribué.');
      }
      return null;
    }

    const selector = document.getElementById('quizGroupId');
    let groupId = selector?.value || context.groups[0].id;
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

  async function injectSelector() {
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
  }

  async function repairOwnSessions() {
    const user = auth.currentUser || state.user;
    if (!user || user.isAnonymous || state.repairing) return;
    state.repairing = true;

    try {
      const context = await resolveContext(true);
      if (!context.organizationId || !context.groups.length) return;

      const groups = new Map(context.groups.map(group => [group.id, group]));
      const ownSnap = await db.ref(`organizerSessions/${user.uid}`).once('value');
      const own = ownSnap.val() || {};
      const codes = Object.keys(own);
      if (!codes.length) return;

      const snapshots = await Promise.all(codes.map(code => db.ref(`sessions/${code}`).once('value')));
      const updates = {};

      snapshots.forEach((snapshot, index) => {
        const code = codes[index];
        const session = snapshot.val();
        if (!session || session.ownerUid !== user.uid) return;

        let organizationId = session.organizationId || own[code]?.organizationId || '';
        let groupId = session.groupId || own[code]?.groupId || '';

        if ((!organizationId || !groupId) && !context.isOwner && context.groups.length === 1) {
          organizationId = context.organizationId;
          groupId = context.groups[0].id;
        }
        if (organizationId !== context.organizationId || !groups.has(groupId)) return;

        const group = groups.get(groupId);
        const createdAt = Number(session.createdAt || own[code]?.createdAt || Date.now());
        const updatedAt = Number(session.updatedAt || own[code]?.updatedAt || createdAt);

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
          name: session.name || own[code]?.name || code,
          ownerUid: user.uid,
          ownerEmail: session.ownerEmail || user.email || '',
          status: session.status || own[code]?.status || 'waiting',
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
    await repairOwnSessions();

    const snapshots = await Promise.all(context.groups.map(group =>
      db.ref(`groupSessions/${context.organizationId}/${group.id}`).once('value')
    ));
    const sessions = [];

    snapshots.forEach((snapshot, index) => {
      const group = context.groups[index];
      Object.entries(snapshot.val() || {}).forEach(([code, value]) => {
        sessions.push({ code, organizationId: context.organizationId, groupId: group.id, groupName: group.name || 'Groupe', ...value });
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

    const snap = await db.ref(`sessions/${code}`).once('value');
    const session = snap.val();
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
    const snap = await db.ref(`sessions/${code}`).once('value');
    const session = snap.val();
    if (!session || session.ownerUid !== user.uid) throw new Error('Action non autorisée.');
    if (!session.organizationId || !session.groupId) return;

    await db.ref().update({
      [`groupSessions/${session.organizationId}/${session.groupId}/${code}`]: null,
      [`sessions/${code}/organizationId`]: null,
      [`sessions/${code}/organizationName`]: null,
      [`sessions/${code}/groupId`]: null,
      [`sessions/${code}/groupName`]: null,
      [`organizerSessions/${user.uid}/${code}/organizationId`]: null,
      [`organizerSessions/${user.uid}/${code}/groupId`]: null,
      [`organizerSessions/${user.uid}/${code}/groupName`]: null
    });
  }

  auth.onAuthStateChanged(async user => {
    state.user = user && !user.isAnonymous ? user : null;
    reset();
    if (!state.user) return;
    await acceptPendingInvite(state.user);
    await injectSelector().catch(error => console.warn('Sélecteur de groupe indisponible :', error));
    await repairOwnSessions();
  });

  window.addEventListener('quizlive-enterprise-membership-ready', () => {
    reset();
    injectSelector().catch(() => {});
    repairOwnSessions();
  });

  window.QuizLiveGroups = {
    resolveContext,
    selectedGroupContext,
    injectCreateGroupSelector: injectSelector,
    repairOwnGroupSessions: repairOwnSessions,
    loadSharedSessions,
    assignSession,
    removeAssignment,
    acceptPendingEmailInvite: acceptPendingInvite
  };
})();