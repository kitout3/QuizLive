(() => {
  'use strict';

  const VERSION = '3.1.0';
  let joining = false;

  const normalizeCode = value => String(value || '')
    .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

  const cleanName = value => String(value || '')
    .trim().replace(/[<>"'&]/g, '').replace(/\s+/g, ' ').slice(0, 30);

  function notify(text, type = 'error') {
    if (typeof window.showToast === 'function') window.showToast(text, type);
    else alert(text);
  }

  function readableError(error, step) {
    const code = String(error?.code || '').toLowerCase();
    console.error(`[Participant v3] ${step}`, error);
    if (code.includes('permission-denied') || code.includes('permission_denied')) {
      return `Accès Firebase refusé pendant l’étape « ${step} ». Les règles Realtime Database publiées ne correspondent pas au code actuel.`;
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
    const auth = firebase.auth();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

    const tabUid = sessionStorage.getItem('quizliveParticipantUid');
    let current = auth.currentUser;

    if (current && !current.isAnonymous) {
      throw new Error('Ce navigateur est connecté comme organisateur. Ouvrez le lien participant dans une fenêtre privée ou sur un autre appareil.');
    }

    // Un nouvel onglet de test doit obtenir sa propre identité participante.
    if (current?.isAnonymous && tabUid && current.uid === tabUid) return current;
    if (current?.isAnonymous && (!tabUid || current.uid !== tabUid)) {
      await auth.signOut();
      current = null;
    }

    const credential = await auth.signInAnonymously();
    if (!credential?.user?.uid) throw new Error('Firebase n’a pas créé de compte participant anonyme.');
    sessionStorage.setItem('quizliveParticipantUid', credential.user.uid);
    return credential.user;
  }

  async function readSessionMetadata(code) {
    const [codeSnap, statusSnap, maxSnap] = await Promise.all([
      database.ref(`sessions/${code}/code`).once('value'),
      database.ref(`sessions/${code}/status`).once('value'),
      database.ref(`sessions/${code}/maxParticipants`).once('value')
    ]);

    if (!codeSnap.exists()) throw new Error('Session introuvable. Vérifiez le code.');
    const status = statusSnap.val() || 'waiting';
    if (!['waiting', 'active', 'En préparation', 'En cours'].includes(status)) {
      throw new Error('Cette session est terminée.');
    }

    return {
      status,
      maxParticipants: Number(maxSnap.val() || 500)
    };
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

      step = 'authentification anonyme';
      const user = await getAnonymousUser();

      step = 'lecture de la session';
      await readSessionMetadata(code);

      step = 'inscription du participant';
      const participantRef = database.ref(`sessions/${code}/participants/${user.uid}`);
      const existingSnap = await participantRef.once('value');
      const existing = existingSnap.val() || {};
      const now = Date.now();

      await participantRef.set({
        id: user.uid,
        name,
        joinedAt: Number(existing.joinedAt || now),
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

      step = 'sauvegarde locale';
      sessionStorage.setItem('quizSession', JSON.stringify(sessionData));
      localStorage.setItem('quizSession', JSON.stringify(sessionData));

      window.location.replace(`play.html?code=${encodeURIComponent(code)}&v=56`);
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
