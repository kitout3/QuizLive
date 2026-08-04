(() => {
  'use strict';

  let currentUser = null;
  let repairing = false;

  async function resolveContext() {
    if (!currentUser || currentUser.isAnonymous) {
      throw new Error('Compte organisateur requis.');
    }

    const [profileSnap, linksSnap] = await Promise.all([
      database.ref(`organizers/${currentUser.uid}`).once('value'),
      database.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);

    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';

    if (!organizationId) {
      return { organizationId: '', organization: {}, groups: [], isOwner: false };
    }

    const [organizationSnap, membershipSnap, groupsSnap] = await Promise.all([
      database.ref(`organizations/${organizationId}`).once('value'),
      database.ref(`organizationMembers/${organizationId}/${currentUser.uid}`).once('value'),
      database.ref(`organizationGroups/${organizationId}`).once('value')
    ]);

    const organization = organizationSnap.val() || {};
    const membership = membershipSnap.val() || {};
    const allGroups = Object.entries(groupsSnap.val() || {}).map(([id, value]) => ({ id, ...value }));
    const isOwner = organization.ownerUid === currentUser.uid;
    const accessibleIds = new Set();

    Object.entries(membership.groupIds || {}).forEach(([groupId, enabled]) => {
      if (enabled === true) accessibleIds.add(groupId);
    });

    const link = links[organizationId] || {};
    if (link.groupId) accessibleIds.add(link.groupId);
    Object.entries(link.groupIds || {}).forEach(([groupId, enabled]) => {
      if (enabled === true) accessibleIds.add(groupId);
    });

    const groups = isOwner ? allGroups : allGroups.filter(group => accessibleIds.has(group.id));

    return { organizationId, organization, groups, isOwner };
  }

  async function selectedGroupContext() {
    const context = await resolveContext();
    const selector = document.getElementById('quizGroupId');
    let groupId = selector?.value || '';

    if (!groupId && !context.isOwner && context.groups.length) {
      groupId = context.groups[0].id;
    }

    if (!groupId) return null;

    const group = context.groups.find(item => item.id === groupId);
    if (!group) throw new Error('Vous n’avez pas accès à ce groupe.');

    return {
      organizationId: context.organizationId,
      organizationName: context.organization.name || 'Entreprise',
      groupId: group.id,
      groupName: group.name || 'Groupe'
    };
  }

  async function repairOwnGroupIndex() {
    if (repairing || !currentUser || currentUser.isAnonymous) return;
    repairing = true;

    try {
      const context = await resolveContext();
      if (!context.organizationId || !context.groups.length) return;

      const accessibleGroups = new Map(context.groups.map(group => [group.id, group]));
      const ownIndexSnap = await database.ref(`organizerSessions/${currentUser.uid}`).once('value');
      const ownIndex = ownIndexSnap.val() || {};
      const codes = Object.keys(ownIndex);
      if (!codes.length) return;

      const sessionSnapshots = await Promise.all(
        codes.map(code => database.ref(`sessions/${code}`).once('value'))
      );

      const updates = {};

      sessionSnapshots.forEach((snapshot, index) => {
        const code = codes[index];
        const session = snapshot.val();
        if (!session) return;
        if (session.organizationId !== context.organizationId) return;
        if (!session.groupId || !accessibleGroups.has(session.groupId)) return;

        const group = accessibleGroups.get(session.groupId);
        const now = Number(session.updatedAt || session.createdAt || Date.now());

        updates[`groupSessions/${context.organizationId}/${session.groupId}/${code}`] = {
          code,
          name: session.name || ownIndex[code]?.name || code,
          ownerUid: session.ownerUid || currentUser.uid,
          ownerEmail: session.ownerEmail || currentUser.email || '',
          status: session.status || ownIndex[code]?.status || 'waiting',
          createdAt: Number(session.createdAt || ownIndex[code]?.createdAt || now),
          updatedAt: now
        };

        updates[`organizerSessions/${currentUser.uid}/${code}/organizationId`] = context.organizationId;
        updates[`organizerSessions/${currentUser.uid}/${code}/groupId`] = session.groupId;
        updates[`organizerSessions/${currentUser.uid}/${code}/groupName`] = session.groupName || group.name || 'Groupe';
      });

      if (Object.keys(updates).length) {
        await database.ref().update(updates);
      }
    } catch (error) {
      console.warn('Réparation des quiz partagés impossible :', error);
    } finally {
      repairing = false;
    }
  }

  async function refreshSharedView() {
    await repairOwnGroupIndex();
    if (typeof window.QuizLiveGroupSharing?.renderDashboardGroupQuizzes === 'function') {
      setTimeout(() => window.QuizLiveGroupSharing.renderDashboardGroupQuizzes(), 50);
    }
  }

  firebase.auth().onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;

    if (window.QuizLiveGroupSharing) {
      window.QuizLiveGroupSharing.selectedGroupContext = selectedGroupContext;
    }

    await refreshSharedView();
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-section="quizzes"]')) {
      setTimeout(refreshSharedView, 150);
    }
  });

  window.addEventListener('quizlive-enterprise-membership-ready', () => {
    setTimeout(refreshSharedView, 100);
  });

  window.QuizLiveGroupSharingFix = {
    resolveContext,
    selectedGroupContext,
    repairOwnGroupIndex,
    refreshSharedView
  };
})();
