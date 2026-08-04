(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const groupsApi = window.QuizLiveGroups;

  if (!groupsApi) return;

  async function sessionAndContext(code) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error('Compte organisateur requis.');

    const [context, sessionSnap] = await Promise.all([
      groupsApi.resolveContext(true),
      db.ref(`sessions/${code}`).once('value')
    ]);

    const session = sessionSnap.val();
    if (!session) throw new Error('Quiz introuvable.');

    return { user, context, session };
  }

  function canManage(user, context, session) {
    if (session.ownerUid === user.uid) return true;
    return Boolean(
      context.isOwner &&
      session.organizationId &&
      session.organizationId === context.organizationId
    );
  }

  async function assignSession(code, groupId) {
    const { user, context, session } = await sessionAndContext(code);
    const group = context.groups.find(item => item.id === groupId);

    if (!group) throw new Error('Groupe inaccessible.');
    if (!canManage(user, context, session)) {
      throw new Error('Vous ne pouvez pas modifier l’affectation de ce quiz.');
    }

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

    updates[`groupSessions/${context.organizationId}/${group.id}/${code}`] = {
      code,
      name: session.name || code,
      ownerUid: session.ownerUid || user.uid,
      ownerEmail: session.ownerEmail || user.email || '',
      status: session.status || 'waiting',
      createdAt: Number(session.createdAt || now),
      updatedAt: now
    };

    if (session.ownerUid === user.uid) {
      updates[`organizerSessions/${user.uid}/${code}/organizationId`] = context.organizationId;
      updates[`organizerSessions/${user.uid}/${code}/groupId`] = group.id;
      updates[`organizerSessions/${user.uid}/${code}/groupName`] = group.name || 'Groupe';
      updates[`organizerSessions/${user.uid}/${code}/updatedAt`] = now;
    }

    await db.ref().update(updates);
  }

  async function removeAssignment(code) {
    const { user, context, session } = await sessionAndContext(code);

    if (!canManage(user, context, session)) {
      throw new Error('Vous ne pouvez pas retirer ce quiz du groupe.');
    }
    if (!session.organizationId || !session.groupId) return;

    const updates = {
      [`groupSessions/${session.organizationId}/${session.groupId}/${code}`]: null,
      [`sessions/${code}/organizationId`]: null,
      [`sessions/${code}/organizationName`]: null,
      [`sessions/${code}/groupId`]: null,
      [`sessions/${code}/groupName`]: null,
      [`sessions/${code}/updatedAt`]: Date.now()
    };

    if (session.ownerUid === user.uid) {
      updates[`organizerSessions/${user.uid}/${code}/organizationId`] = null;
      updates[`organizerSessions/${user.uid}/${code}/groupId`] = null;
      updates[`organizerSessions/${user.uid}/${code}/groupName`] = null;
    }

    await db.ref().update(updates);
  }

  async function deleteSession(code) {
    const { user, context, session } = await sessionAndContext(code);

    if (!canManage(user, context, session)) {
      throw new Error('Vous ne pouvez pas supprimer ce quiz.');
    }

    const updates = {
      [`sessions/${code}`]: null
    };

    if (session.organizationId && session.groupId) {
      updates[`groupSessions/${session.organizationId}/${session.groupId}/${code}`] = null;
    }

    if (session.ownerUid === user.uid) {
      updates[`organizerSessions/${user.uid}/${code}`] = null;
    }

    await db.ref().update(updates);
  }

  async function cleanupOwnSessionIndex() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;

    try {
      const indexSnap = await db.ref(`organizerSessions/${user.uid}`).once('value');
      const index = indexSnap.val() || {};
      const codes = Object.keys(index);
      if (!codes.length) return;

      const sessions = await Promise.all(
        codes.map(code => db.ref(`sessions/${code}`).once('value'))
      );
      const updates = {};

      sessions.forEach((snapshot, indexPosition) => {
        if (!snapshot.exists()) {
          updates[`organizerSessions/${user.uid}/${codes[indexPosition]}`] = null;
        }
      });

      if (Object.keys(updates).length) await db.ref().update(updates);
    } catch (error) {
      console.warn('Nettoyage des anciens quiz impossible :', error);
    }
  }

  window.QuizLiveGroups = {
    ...groupsApi,
    assignSession,
    removeAssignment,
    deleteSession,
    cleanupOwnSessionIndex
  };

  auth.onAuthStateChanged(user => {
    if (user && !user.isAnonymous) cleanupOwnSessionIndex();
  });
})();
