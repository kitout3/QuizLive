(() => {
  'use strict';

  const VERSION = '6.0.0';
  const DEFAULT_LIMIT = 10;
  const PLAN_BY_LIMIT = {
    10: 'Free',
    50: 'Pro',
    200: 'Business',
    500: 'Enterprise'
  };
  let joining = false;

  const normalizeCode = value => String(value || '')
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const cleanName = value => String(value || '')
    .trim().replace(/[<>"'&]/g, '').replace(/\s+/g, ' ').slice(0, 30);

  const createParticipantId = () => {
    if (globalThis.crypto?.randomUUID) {
      return `p_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
    }
    const random = Math.random().toString(36).slice(2);
    return `p_${Date.now().toString(36)}${random}`;
  };

  function participantDatabaseService() {
    const db = window.QuizLiveFirebase?.participantDatabase
      || window.QuizLiveFirebase?.organizerDatabase
      || window.database;
    if (!db) throw new Error('La base Firebase participante n’est pas initialisée.');
    return db;
  }

  function notify(text, type = 'error') {
    if (typeof window.showToast === 'function') window.showToast(text, type);
    else alert(text);
  }

  function participantLimit(session) {
    const value = Number(session?.maxParticipants);
    if (!Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(500, Math.floor(value)));
  }

  function participantCount(session) {
    return Object.keys(session?.participants || {}).length;
  }

  function limitReachedError(limit) {
    const plan = PLAN_BY_LIMIT[limit];
    const suffix = plan ? ` du forfait ${plan}` : '';
    const error = new Error(`Cette session a atteint la limite de ${limit} participants${suffix}.`);
    error.code = 'quizlive/participant-limit-reached';
    error.participantLimit = limit;
    return error;
  }

  function readableError(error, step) {
    const code = String(error?.code || '').toLowerCase();
    console.error(`[Participant ${VERSION}] ${step}`, error);

    if (code === 'quizlive/participant-limit-reached') {
      return error.message;
    }
    if (code.includes('permission-denied') || code.includes('permission_denied')) {
      if (step === 'inscription du participant') {
        return 'Impossible de rejoindre : la limite de participants autorisée par le forfait de l’organisateur est atteinte.';
      }
      return `Accès Firebase refusé pendant l’étape « ${step} ».`;
    }
    if (code.includes('network-request-failed')) {
      return 'Connexion réseau interrompue. Réessayez.';
    }
    return error?.message || `Connexion impossible pendant l’étape « ${step} ».`;
  }

  async function readSessionMetadata(db, code) {
    const snapshot = await db.ref(`sessions/${code}`).once('value');
    if (!snapshot.exists()) throw new Error('Session introuvable. Vérifiez le code.');

    const session = snapshot.val() || {};
    const status = session.status || 'waiting';
    if (!['waiting', 'active', 'En préparation', 'En cours'].includes(status)) {
      throw new Error('Cette session est terminée.');
    }
    return session;
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

      const db = participantDatabaseService();

      step = 'lecture de la session';
      const session = await readSessionMetadata(db, code);
      const maxParticipants = participantLimit(session);

      const previous = (() => {
        try { return JSON.parse(sessionStorage.getItem('quizSession') || '{}'); }
        catch (_) { return {}; }
      })();

      const participantId = previous.code === code && previous.participantId
        ? previous.participantId
        : createParticipantId();

      step = 'inscription du participant';
      const participantRef = db.ref(`sessions/${code}/participants/${participantId}`);
      const existingSnap = await participantRef.once('value');
      const existing = existingSnap.val() || {};

      if (!existingSnap.exists()) {
        const latestParticipants = await db.ref(`sessions/${code}/participants`).once('value');
        const latestCount = latestParticipants.numChildren();
        if (latestCount >= maxParticipants) {
          throw limitReachedError(maxParticipants);
        }
      }

      const now = Date.now();
      try {
        // update() conserve le score et les réponses si un participant déjà inscrit se reconnecte.
        await participantRef.update({
          id: participantId,
          name,
          joinedAt: Number(existing.joinedAt || now),
          lastSeenAt: now,
          connected: true
        });
      } catch (error) {
        const errorCode = String(error?.code || '').toLowerCase();
        if (!existingSnap.exists() && (errorCode.includes('permission-denied') || errorCode.includes('permission_denied'))) {
          throw limitReachedError(maxParticipants);
        }
        throw error;
      }

      const sessionData = {
        code,
        isAdmin: false,
        participantId,
        odparticipantId: participantId,
        playerId: participantId,
        name,
        joinVersion: VERSION
      };

      sessionStorage.setItem('quizSession', JSON.stringify(sessionData));
      window.location.replace(`play.html?code=${encodeURIComponent(code)}&v=92`);
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

  window.QuizLiveParticipantJoin = {
    version: VERSION,
    join,
    normalizeCode,
    cleanName,
    participantLimit
  };
})();