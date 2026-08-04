(() => {
  'use strict';

  const MAX_NAME_LENGTH = 30;
  let joining = false;

  const normalizeCode = value => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const cleanName = value => String(value || '').trim().replace(/[<>"'&]/g, '').replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  const pseudoKey = value => cleanName(value).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

  function message(text, type = 'error') {
    if (typeof window.showToast === 'function') window.showToast(text, type);
    else alert(text);
  }

  function friendlyError(error) {
    const code = error?.code || '';
    if (code.includes('permission-denied') || code === 'PERMISSION_DENIED') return 'Accès refusé par Firebase. Publiez les nouvelles règles Realtime Database.';
    if (code.includes('operation-not-allowed')) return 'La connexion anonyme doit être activée dans Firebase Authentication.';
    if (code.includes('network-request-failed')) return 'Connexion réseau interrompue. Réessayez.';
    return error?.message || 'Connexion au quiz impossible.';
  }

  async function anonymousUser() {
    const auth = firebase.auth();
    let user = auth.currentUser;

    if (user && user.isAnonymous) return user;

    // Une session participante ne doit jamais déconnecter le compte organisateur
    // dans un autre onglet. SESSION limite la persistance à cet onglet.
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

    if (user && !user.isAnonymous) {
      throw new Error('Ouvrez le lien participant dans une fenêtre privée ou sur un autre appareil afin de conserver votre compte organisateur connecté.');
    }

    const credential = await auth.signInAnonymously();
    return credential.user;
  }

  async function reservePseudo(code, name, uid) {
    const key = pseudoKey(name);
    if (!key) throw new Error('Pseudo invalide.');

    const ref = database.ref(`sessionPseudos/${code}/${key}`);
    const result = await ref.transaction(current => {
      if (current === null || current?.uid === uid) {
        return { uid, name, normalized: key, reservedAt: Date.now() };
      }
      return;
    }, undefined, false);

    if (!result.committed) throw new Error('Ce pseudo est déjà utilisé dans cette session.');
    return { ref, key };
  }

  async function join(codeInput, nameInput) {
    if (joining) return;
    joining = true;

    const code = normalizeCode(codeInput);
    const name = cleanName(nameInput);
    let reservation = null;

    try {
      if (code.length !== 6) throw new Error('Le code de session doit contenir 6 caractères.');
      if (!name) throw new Error('Saisissez un pseudo.');

      const user = await anonymousUser();
      const sessionRef = database.ref(`sessions/${code}`);
      const sessionSnap = await sessionRef.once('value');
      if (!sessionSnap.exists()) throw new Error('Session introuvable. Vérifiez le code.');

      const session = sessionSnap.val() || {};
      const allowedStatuses = ['waiting', 'active', 'En préparation', 'En cours'];
      if (session.status && !allowedStatuses.includes(session.status)) throw new Error('Cette session est terminée.');

      const participants = session.participants || {};
      const maxParticipants = Number(session.maxParticipants || 500);
      const alreadyJoined = Boolean(participants[user.uid]);
      if (!alreadyJoined && Object.keys(participants).length >= maxParticipants) throw new Error(`La session a atteint sa limite de ${maxParticipants} participants.`);

      reservation = await reservePseudo(code, name, user.uid);

      // Chaque appareil écrit uniquement sous son UID : aucune arrivée ne peut écraser une autre.
      await database.ref(`sessions/${code}/participants/${user.uid}`).set({
        id: user.uid,
        name,
        joinedAt: alreadyJoined ? (participants[user.uid]?.joinedAt || Date.now()) : Date.now(),
        lastSeenAt: Date.now(),
        connected: true
      });

      localStorage.setItem('quizSession', JSON.stringify({
        code,
        isAdmin: false,
        participantId: user.uid,
        odparticipantId: user.uid,
        name,
        pseudoKey: reservation.key
      }));

      window.location.assign(`play.html?code=${encodeURIComponent(code)}&v=55`);
    } catch (error) {
      if (reservation?.ref) {
        try { await reservation.ref.remove(); } catch (_) {}
      }
      console.error('Participant join v2:', error);
      message(friendlyError(error), 'error');
    } finally {
      joining = false;
    }
  }

  window.joinQuiz = event => {
    event?.preventDefault?.();
    return join(document.getElementById('sessionCode')?.value, document.getElementById('playerName')?.value);
  };

  window.joinViaQR = event => {
    event?.preventDefault?.();
    return join(document.getElementById('qrSessionCode')?.value, document.getElementById('qrPlayerName')?.value);
  };

  window.QuizLiveParticipantJoin = { join, normalizeCode, cleanName };
})();
