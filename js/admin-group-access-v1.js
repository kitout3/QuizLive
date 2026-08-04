(() => {
  'use strict';

  // Empêche le garde historique de js/app.js de bloquer tous les comptes
  // qui ne correspondent pas à l'ancien ADMIN_UID unique.
  const originalPage = document.body?.dataset?.page || 'admin';
  if (document.body) document.body.dataset.page = 'admin-access-pending';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  let initializedCode = '';

  async function isOrganizationOwner(user, organizationId) {
    if (!organizationId) return false;
    try {
      const snap = await db.ref(`organizations/${organizationId}/ownerUid`).once('value');
      return snap.val() === user.uid;
    } catch (_) {
      return false;
    }
  }

  async function isGroupMember(user, organizationId, groupId) {
    if (!organizationId || !groupId) return false;

    try {
      const canonical = await db
        .ref(`organizationMembers/${organizationId}/${user.uid}/groupIds/${groupId}`)
        .once('value');
      if (canonical.val() === true) return true;
    } catch (_) {
      // Compatibilité avec l'ancien index ci-dessous.
    }

    try {
      const legacy = await db
        .ref(`organizationGroupMembers/${organizationId}/${groupId}/${user.uid}`)
        .once('value');
      return legacy.exists();
    } catch (_) {
      return false;
    }
  }

  async function canManageSession(user, code) {
    if (!user || user.isAnonymous || !code) return false;

    const sessionSnap = await db.ref(`sessions/${code}`).once('value');
    const session = sessionSnap.val();
    if (!session) throw new Error('Quiz introuvable.');

    if (session.ownerUid === user.uid) return true;
    if (!session.organizationId || !session.groupId) return false;
    if (await isOrganizationOwner(user, session.organizationId)) return true;
    return isGroupMember(user, session.organizationId, session.groupId);
  }

  function showDenied(message) {
    if (typeof window.showAdminLogin === 'function') window.showAdminLogin(true);
    if (typeof window.setLoginError === 'function') {
      window.setLoginError(message || 'Vous n’avez pas accès à ce quiz.');
    }
  }

  async function startAuthorizedAdmin(user) {
    const code = new URLSearchParams(location.search).get('code') || '';
    if (!code) {
      location.replace('dashboard.html?section=quizzes');
      return;
    }

    try {
      const allowed = await canManageSession(user, code);
      if (!allowed) {
        showDenied('Accès refusé : ce quiz ne fait pas partie de vos groupes.');
        return;
      }

      if (document.body) document.body.dataset.page = originalPage === 'admin-access-pending' ? 'admin' : originalPage;
      if (typeof window.bindAdminLoginUI === 'function') window.bindAdminLoginUI();
      if (typeof window.setLoginError === 'function') window.setLoginError('');
      if (typeof window.showAdminLogin === 'function') window.showAdminLogin(false);

      if (initializedCode !== code && typeof window.initAdmin === 'function') {
        initializedCode = code;
        window.initAdmin();
      }
    } catch (error) {
      console.error('Contrôle d’accès au quiz :', error);
      showDenied(error.message || 'Impossible de vérifier votre accès.');
    }
  }

  window.addEventListener('load', () => {
    if (typeof window.bindAdminLoginUI === 'function') window.bindAdminLoginUI();

    auth.onAuthStateChanged(user => {
      if (!user || user.isAnonymous) {
        showDenied('Connectez-vous avec votre compte organisateur.');
        return;
      }
      startAuthorizedAdmin(user);
    });
  });

  window.QuizLiveAdminAccess = {
    canManageSession,
    isOrganizationOwner,
    isGroupMember
  };
})();