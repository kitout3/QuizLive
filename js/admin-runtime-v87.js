// QuizLive — runtime admin déterministe v87.
// Ce fichier est chargé APRES app.js : aucune course entre l'authentification et le moteur du quiz.
(() => {
  'use strict';

  const VERSION = '87';
  const READ_TIMEOUT_MS = 10000;
  const AUTH_TIMEOUT_MS = 10000;

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;

  let started = false;
  let ready = false;
  let realtimeRef = null;
  let realtimeValueHandler = null;
  let realtimeErrorHandler = null;
  let bootTimer = null;

  const codeFromUrl = () => String(new URLSearchParams(location.search).get('code') || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  function stage(message, error = false, details = '') {
    const display = document.getElementById('questionDisplay');
    if (!display) return;

    display.innerHTML = `
      <div class="waiting-screen">
        <div class="waiting-icon">${error ? '⚠️' : '⏳'}</div>
        <div class="waiting-text">${escapeHtmlSafe(message)}</div>
        ${details ? `<div style="margin-top:10px;color:var(--text-muted);font-size:.82rem;max-width:680px;word-break:break-word">${escapeHtmlSafe(details)}</div>` : ''}
        ${error ? `
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px">
            <button type="button" class="btn-primary" id="adminRuntimeRetry">Réessayer</button>
            <a class="add-question-btn" href="dashboard.html?section=quizzes&v=${VERSION}" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;padding:12px 18px">Retour à mes quiz</a>
          </div>` : ''}
      </div>`;

    document.getElementById('adminRuntimeRetry')?.addEventListener('click', () => {
      const code = codeFromUrl();
      location.replace(`admin.html?code=${encodeURIComponent(code)}&v=${VERSION}&retry=${Date.now()}`);
    });
  }

  function escapeHtmlSafe(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function withTimeout(promise, milliseconds, label) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label} a dépassé ${Math.round(milliseconds / 1000)} secondes.`);
          error.code = `${label}_TIMEOUT`;
          reject(error);
        }, milliseconds);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function stopRealtime() {
    if (realtimeRef && realtimeValueHandler) {
      realtimeRef.off('value', realtimeValueHandler);
    }
    realtimeRef = null;
    realtimeValueHandler = null;
    realtimeErrorHandler = null;
  }

  function setSessionAndRender(session, code) {
    if (!session || typeof session !== 'object') {
      throw new Error('Les données du quiz sont invalides.');
    }

    // app.js déclare currentSession au niveau global. Comme ce runtime est chargé
    // après app.js, cette liaison existe déjà et peut être mise à jour directement.
    currentSession = session;
    currentSession.code = code;

    if (typeof updateAdminUI !== 'function') {
      throw new Error('La fonction updateAdminUI est indisponible.');
    }

    updateAdminUI();

    const codeNode = document.getElementById('sessionCode');
    if (!codeNode || codeNode.textContent.trim() !== code) {
      throw new Error('Le moteur du quiz n’a pas terminé son affichage.');
    }

    ready = true;
    document.body.dataset.page = 'admin';
    clearTimeout(bootTimer);
  }

  async function readSession(code) {
    stage('Lecture du quiz dans Firebase…');
    const snapshot = await withTimeout(
      db.ref(`sessions/${code}`).once('value'),
      READ_TIMEOUT_MS,
      'Lecture Firebase'
    );

    if (!snapshot.exists()) {
      const error = new Error(`Le quiz ${code} est introuvable dans Firebase.`);
      error.code = 'QUIZ_NOT_FOUND';
      throw error;
    }

    return snapshot.val() || {};
  }

  async function ownsLegacySession(user, code) {
    try {
      const snapshot = await withTimeout(
        db.ref(`organizerSessions/${user.uid}/${code}`).once('value'),
        5000,
        'Lecture de l’index organisateur'
      );
      return snapshot.exists();
    } catch (_) {
      return false;
    }
  }

  async function organizationOwner(user, organizationId) {
    if (!organizationId) return false;
    try {
      const snapshot = await withTimeout(
        db.ref(`organizations/${organizationId}/ownerUid`).once('value'),
        5000,
        'Lecture du propriétaire de l’organisation'
      );
      return snapshot.val() === user.uid;
    } catch (_) {
      return false;
    }
  }

  async function groupMember(user, organizationId, groupId) {
    if (!organizationId || !groupId) return false;

    try {
      const canonical = await withTimeout(
        db.ref(`organizationMembers/${organizationId}/${user.uid}/groupIds/${groupId}`).once('value'),
        5000,
        'Lecture du groupe'
      );
      if (canonical.val() === true) return true;
    } catch (_) {}

    try {
      const legacy = await withTimeout(
        db.ref(`organizationGroupMembers/${organizationId}/${groupId}/${user.uid}`).once('value'),
        5000,
        'Lecture du groupe historique'
      );
      return legacy.exists();
    } catch (_) {
      return false;
    }
  }

  async function canManage(user, session, code) {
    if (session.ownerUid && session.ownerUid === user.uid) return true;

    // Compatibilité avec les anciens quiz qui ne possèdent pas ownerUid.
    if (!session.ownerUid && await ownsLegacySession(user, code)) return true;

    if (!session.organizationId || !session.groupId) return false;
    if (await organizationOwner(user, session.organizationId)) return true;
    return groupMember(user, session.organizationId, session.groupId);
  }

  function attachRealtime(code) {
    stopRealtime();
    realtimeRef = db.ref(`sessions/${code}`);

    realtimeValueHandler = snapshot => {
      try {
        if (!snapshot.exists()) {
          stage('Ce quiz a été supprimé.', true);
          stopRealtime();
          return;
        }
        setSessionAndRender(snapshot.val() || {}, code);
      } catch (error) {
        console.error(`[Admin runtime ${VERSION}] rendu temps réel`, error);
        stage('Le quiz est chargé mais son affichage a échoué.', true, error.message || String(error));
      }
    };

    realtimeErrorHandler = error => {
      console.error(`[Admin runtime ${VERSION}] Firebase temps réel`, error);
      stage(
        error?.code === 'PERMISSION_DENIED'
          ? 'Firebase refuse la synchronisation de ce quiz.'
          : 'La synchronisation temps réel du quiz a échoué.',
        true,
        `${error?.code || 'ERREUR'} — ${error?.message || error}`
      );
    };

    realtimeRef.on('value', realtimeValueHandler, realtimeErrorHandler);
  }

  function showLogin() {
    stage('Connexion organisateur requise.');
    if (typeof bindAdminLoginUI === 'function') bindAdminLoginUI();
    if (typeof setLoginError === 'function') setLoginError('Connectez-vous avec votre compte organisateur.');
    if (typeof showAdminLogin === 'function') showAdminLogin(true);
  }

  async function boot(user) {
    if (started) return;
    started = true;
    ready = false;

    const code = codeFromUrl();
    if (!code) {
      location.replace(`dashboard.html?section=quizzes&v=${VERSION}`);
      return;
    }

    try {
      stage('Vérification de votre accès au quiz…');
      const session = await readSession(code);

      stage('Vérification des droits du compte…');
      if (!await canManage(user, session, code)) {
        const error = new Error('Ce compte n’est ni propriétaire du quiz ni membre de son groupe.');
        error.code = 'ACCESS_DENIED';
        throw error;
      }

      if (typeof bindAdminLoginUI === 'function') bindAdminLoginUI();
      if (typeof setLoginError === 'function') setLoginError('');
      if (typeof showAdminLogin === 'function') showAdminLogin(false);

      stage('Affichage du quiz…');
      setSessionAndRender(session, code);
      attachRealtime(code);

      console.info(`[Admin runtime ${VERSION}] Quiz ${code} prêt.`);
    } catch (error) {
      console.error(`[Admin runtime ${VERSION}] démarrage`, error);
      stage(
        error?.code === 'PERMISSION_DENIED'
          ? 'Firebase refuse la lecture de ce quiz.'
          : (error?.message || 'Impossible d’ouvrir le quiz.'),
        true,
        error?.code ? `Code : ${error.code}` : ''
      );
    } finally {
      started = false;
    }
  }

  // app.js est déjà entièrement chargé à ce stade.
  document.body.dataset.page = 'admin';
  if (typeof bindAdminLoginUI === 'function') bindAdminLoginUI();

  bootTimer = setTimeout(() => {
    if (!ready) {
      stage(
        'Le démarrage du quiz n’a pas abouti.',
        true,
        'Le runtime v87 est actif mais une étape n’a pas terminé. Cliquez sur Réessayer.'
      );
    }
  }, 15000);

  auth.onAuthStateChanged(user => {
    if (!user || user.isAnonymous) {
      stopRealtime();
      showLogin();
      return;
    }
    boot(user);
  }, error => {
    console.error(`[Admin runtime ${VERSION}] authentification`, error);
    stage('Impossible de vérifier votre connexion Firebase.', true, error?.message || String(error));
  });

  // Toute erreur JavaScript pendant le démarrage devient visible au lieu de laisser
  // l'utilisateur devant un écran de chargement permanent.
  window.addEventListener('error', event => {
    if (ready) return;
    const message = event.error?.message || event.message || 'Erreur JavaScript inconnue';
    console.error(`[Admin runtime ${VERSION}] erreur globale`, event.error || event);
    stage('Une erreur JavaScript bloque l’ouverture du quiz.', true, message);
  });

  window.addEventListener('unhandledrejection', event => {
    if (ready) return;
    const reason = event.reason;
    const message = reason?.message || String(reason || 'Promesse rejetée sans détail');
    console.error(`[Admin runtime ${VERSION}] rejet non géré`, reason);
    stage('Une erreur asynchrone bloque l’ouverture du quiz.', true, message);
  });

  window.addEventListener('beforeunload', stopRealtime);

  window.QuizLiveAdminRuntime = {
    version: VERSION,
    boot,
    readSession,
    canManage,
    retry: () => {
      started = false;
      const user = auth.currentUser;
      if (user && !user.isAnonymous) return boot(user);
      showLogin();
    }
  };
})();
