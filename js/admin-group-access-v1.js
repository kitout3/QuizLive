(() => {
  'use strict';

  const VERSION = '85';
  const ACCESS_TIMEOUT_MS = 8000;
  const APP_READY_TIMEOUT_MS = 8000;

  // Désactive immédiatement l'ancien garde mono-admin de app.js.
  const originalPage = document.body?.dataset?.page || 'admin';
  if (document.body) document.body.dataset.page = 'admin-access-pending';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;

  let initializedCode = '';
  let booting = false;
  let authResolved = false;

  function withTimeout(promise, timeout, label) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), timeout);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function codeFromUrl() {
    return String(new URLSearchParams(location.search).get('code') || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
  }

  function setBootStatus(message, isError = false) {
    const display = document.getElementById('questionDisplay');
    if (!display) return;

    display.innerHTML = `
      <div class="waiting-screen">
        <div class="waiting-icon">${isError ? '⚠️' : '⏳'}</div>
        <div class="waiting-text">${message}</div>
        ${isError ? '<button type="button" class="btn-primary" id="adminBootRetry" style="margin-top:20px">Réessayer</button>' : ''}
      </div>`;

    if (isError) {
      document.getElementById('adminBootRetry')?.addEventListener('click', () => {
        location.replace(`admin.html?code=${encodeURIComponent(codeFromUrl())}&v=${VERSION}`);
      });
    }
  }

  async function isOrganizationOwner(user, organizationId) {
    if (!organizationId) return false;
    try {
      const snap = await withTimeout(
        db.ref(`organizations/${organizationId}/ownerUid`).once('value'),
        ACCESS_TIMEOUT_MS,
        'OWNER_READ'
      );
      return snap.val() === user.uid;
    } catch (_) {
      return false;
    }
  }

  async function isGroupMember(user, organizationId, groupId) {
    if (!organizationId || !groupId) return false;

    try {
      const canonical = await withTimeout(
        db.ref(`organizationMembers/${organizationId}/${user.uid}/groupIds/${groupId}`).once('value'),
        ACCESS_TIMEOUT_MS,
        'MEMBERSHIP_READ'
      );
      if (canonical.val() === true) return true;
    } catch (_) {}

    try {
      const legacy = await withTimeout(
        db.ref(`organizationGroupMembers/${organizationId}/${groupId}/${user.uid}`).once('value'),
        ACCESS_TIMEOUT_MS,
        'LEGACY_MEMBERSHIP_READ'
      );
      return legacy.exists();
    } catch (_) {
      return false;
    }
  }

  async function readSession(code) {
    const sessionSnap = await withTimeout(
      db.ref(`sessions/${code}`).once('value'),
      ACCESS_TIMEOUT_MS,
      'SESSION_READ'
    );

    if (!sessionSnap.exists()) throw new Error('Quiz introuvable.');
    return sessionSnap.val() || {};
  }

  async function canManageSession(user, code, knownSession = null) {
    if (!user || user.isAnonymous || !code) return false;

    const session = knownSession || await readSession(code);
    if (session.ownerUid === user.uid) return true;
    if (!session.organizationId || !session.groupId) return false;
    if (await isOrganizationOwner(user, session.organizationId)) return true;
    return isGroupMember(user, session.organizationId, session.groupId);
  }

  function showDenied(message) {
    setBootStatus(message || 'Vous n’avez pas accès à ce quiz.', true);
    if (typeof window.showAdminLogin === 'function') window.showAdminLogin(true);
    if (typeof window.setLoginError === 'function') {
      window.setLoginError(message || 'Vous n’avez pas accès à ce quiz.');
    }
  }

  async function waitForAppFunctions() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < APP_READY_TIMEOUT_MS) {
      if (typeof window.initAdmin === 'function') return true;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return false;
  }

  async function startAuthorizedAdmin(user) {
    if (booting) return;
    booting = true;

    const code = codeFromUrl();
    if (!code) {
      location.replace('dashboard.html?section=quizzes&v=85');
      return;
    }

    setBootStatus('Chargement du quiz…');

    try {
      // Lecture unique d'abord : elle vérifie à la fois l'existence et évite de
      // refaire cette lecture pour le contrôle d'accès du propriétaire.
      const session = await readSession(code);
      const allowed = await canManageSession(user, code, session);

      if (!allowed) {
        showDenied('Accès refusé : ce quiz ne fait pas partie de vos groupes.');
        return;
      }

      const appReady = await waitForAppFunctions();
      if (!appReady) {
        throw new Error('Le moteur du quiz ne s’est pas chargé correctement.');
      }

      if (document.body) {
        document.body.dataset.page = originalPage === 'admin-access-pending' ? 'admin' : originalPage;
      }

      window.bindAdminLoginUI?.();
      window.setLoginError?.('');
      window.showAdminLogin?.(false);

      if (initializedCode !== code) {
        initializedCode = code;
        window.initAdmin();
      }
    } catch (error) {
      console.error(`[Admin boot ${VERSION}]`, error);

      if (String(error?.message || '').endsWith('_TIMEOUT')) {
        setBootStatus('Firebase met trop de temps à répondre. Vérifiez la connexion puis réessayez.', true);
      } else {
        setBootStatus(error?.message || 'Impossible de charger le quiz.', true);
      }
    } finally {
      booting = false;
    }
  }

  function handleAuth(user) {
    authResolved = true;

    if (!user || user.isAnonymous) {
      setBootStatus('Connexion organisateur requise.', true);
      window.bindAdminLoginUI?.();
      window.showAdminLogin?.(true);
      window.setLoginError?.('Connectez-vous avec votre compte organisateur.');
      return;
    }

    startAuthorizedAdmin(user);
  }

  // Ne plus attendre window.load : Firebase Auth commence dès que le script est lu.
  auth.onAuthStateChanged(handleAuth, error => {
    authResolved = true;
    console.error(`[Admin auth ${VERSION}]`, error);
    setBootStatus('Impossible de vérifier votre connexion.', true);
  });

  // Le formulaire de connexion peut être lié dès que app.js expose ses fonctions.
  (async () => {
    await waitForAppFunctions();
    window.bindAdminLoginUI?.();
  })();

  // Garde ultime : aucune page ne doit rester silencieusement bloquée.
  setTimeout(() => {
    if (!authResolved) {
      setBootStatus('La vérification de connexion prend trop de temps.', true);
    }
  }, 10000);

  window.QuizLiveAdminAccess = {
    version: VERSION,
    canManageSession,
    isOrganizationOwner,
    isGroupMember,
    readSession,
    retry: () => auth.currentUser && startAuthorizedAdmin(auth.currentUser)
  };
})();
