(() => {
  'use strict';

  const VERSION = '4.1.0';
  let joining = false;

  const normalizeCode = value => String(value || '')
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const cleanName = value => String(value || '')
    .trim().replace(/[<>"'&]/g, '').replace(/\s+/g, ' ').slice(0, 30);

  function participantServices() {
    const services = window.QuizLiveFirebase;
    if (!services?.participantAuth || !services?.participantDatabase) {
      throw new Error('Le module Firebase participant n’est pas initialisé. Rechargez la page.');
    }
    return { auth: services.participantAuth, db: services.participantDatabase };
  }

  function notify(text, type = 'error') {
    if (typeof window.showToast === 'function') window.showToast(text, type);
    else alert(text);
  }

  function readableError(error, step) {
    const code = String(error?.code || '').toLowerCase();
    console.error(`[Participant ${VERSION}] ${step}`, error);
    if (code.includes('permission-denied') || code.includes('permission_denied')) {
      return `Accès Firebase refusé pendant l’étape « ${step} ».`;
    }
    if (code.includes('operation-not-allowed')) {
      return 'La connexion anonyme n’est pas activée dans Firebase Authentication.';
    }
    if (code.includes('network-request-failed')) {
      return 'Connexion réseau interrompue. Réessayez.';
    }
    return error?.message || `Connexion impossible pendant l’étape « ${step} ».`;
  }

  async function getAnonymousUser() {
    const { auth } = participantServices();

    // Persistance uniquement en mémoire : aucun cookie, IndexedDB ou localStorage
    // participant ne peut modifier la connexion organisateur.
    await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);

    if (auth.currentUser?.isAnonymous) return auth.currentUser;

    const credential = await auth.signInAnonymously();
    if (!credential?.user?.uid) {
      throw new Error('Firebase n’a pas créé de compte participant anonyme.');
    }
    return credential.user;
  }

  async function readSessionMetadata(db, code) {
    const [codeSnap, statusSnap] = await Promise.all([
      db.ref(`sessions/${code}/code`).once('value'),
      db.ref(`sessions/${code}/status`).once('value')
    ]);

    if (!codeSnap.exists()) throw new Error('Session introuvable. Vérifiez le code.');

    const status = statusSnap.val() || 'waiting';
    if (!['waiting', 'active', 'En préparation', 'En cours'].includes(status)) {
      throw new Error('Cette session est terminée.');
    }
  }

  async function join(codeInput, nameInput) {
    if (joining) return;
    joining = true;

    const code = normalizeCode(codeInput);
    const name = cleanName(nameInput);
    let step = 'validation';

    try {
      if (code.length !== 6) throw new Error('Le code de session doit contenir 6 caractères.');
      if (!name) throw new Error('Saisissez un pseudo.');

      const { db } = participantServices();

      step = 'authentification anonyme';
      const user = await getAnonymousUser();

      step = 'lecture de la session';
      await readSessionMetadata(db, code);

      step = 'inscription du participant';
      const participantRef = db.ref(`sessions/${code}/participants/${user.uid}`);
      const now = Date.now();
      await participantRef.set({
        id: user.uid,
        name,
        joinedAt: now,
        lastSeenAt: now,
        connected: true
      });

      const sessionData = {
        code,
        isAdmin: false,
        participantId: user.uid,
        odparticipantId: user.uid,
        playerId: user.uid,
        name,
        joinVersion: VERSION
      };

      sessionStorage.setItem('quizSession', JSON.stringify(sessionData));
      sessionStorage.setItem('quizliveParticipantUid', user.uid);

      window.location.replace(`play.html?code=${encodeURIComponent(code)}&v=59`);
    } catch (error) {
      notify(readableError(error, step), 'error');
    } finally {
      joining = false;
    }
  }

  window.joinQuiz = event => {
    event?.preventDefault?.();
    return join(
      document.getElementById('sessionCode')?.value,
      document.getElementById('playerName')?.value
    );
  };

  window.joinViaQR = event => {
    event?.preventDefault?.();
    return join(
      document.getElementById('qrSessionCode')?.value,
      document.getElementById('qrPlayerName')?.value
    );
  };

  window.QuizLiveParticipantJoin = { version: VERSION, join, normalizeCode, cleanName };
})();
