// QuizLive - inscription participant et pseudos uniques atomiques
(() => {
  'use strict';

  let joinInProgress = false;

  function normalizePseudo(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase('fr-FR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function cleanPseudo(value) {
    return String(value || '').trim().slice(0, 30).replace(/[<>\"'&]/g, '');
  }

  function pseudoKey(value) {
    const normalized = normalizePseudo(value);
    const bytes = new TextEncoder().encode(normalized);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  async function ensureAnonymousUser() {
    let user = firebase.auth().currentUser;
    if (user && !user.isAnonymous) {
      await firebase.auth().signOut();
      user = null;
    }
    if (!user) {
      const credential = await firebase.auth().signInAnonymously();
      user = credential.user;
    }
    return user;
  }

  function setSubmitState(button, disabled) {
    if (!button) return;
    button.dataset.originalText ||= button.textContent;
    button.disabled = disabled;
    button.textContent = disabled ? 'Connexion…' : button.dataset.originalText;
  }

  async function reservePseudo(sessionCode, pseudo, uid) {
    const key = pseudoKey(pseudo);
    const ref = database.ref(`sessionPseudos/${sessionCode}/${key}`);
    const result = await ref.transaction(current => {
      if (current === null || current?.uid === uid) {
        return {
          uid,
          name: pseudo,
          normalized: normalizePseudo(pseudo),
          reservedAt: firebase.database.ServerValue.TIMESTAMP
        };
      }
      return;
    }, undefined, false);
    return { committed: result.committed, ref };
  }

  async function joinParticipant(event, ids) {
    event?.preventDefault?.();
    if (joinInProgress) return;

    const code = String(document.getElementById(ids.code)?.value || '').trim().toUpperCase();
    const name = cleanPseudo(document.getElementById(ids.name)?.value);
    const submitButton = event?.submitter || event?.target?.querySelector?.('button[type="submit"]');

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      showToast('Le code de session doit contenir 6 caractères', 'error');
      return;
    }
    if (!name) {
      showToast('Renseignez un pseudo', 'error');
      return;
    }

    joinInProgress = true;
    setSubmitState(submitButton, true);
    let reservation = null;

    try {
      const user = await ensureAnonymousUser();
      const sessionSnapshot = await database.ref(`sessions/${code}`).once('value');
      if (!sessionSnapshot.exists()) throw new Error('SESSION_NOT_FOUND');

      reservation = await reservePseudo(code, name, user.uid);
      if (!reservation.committed) {
        showToast('Ce pseudo est déjà utilisé dans cette partie', 'error');
        return;
      }

      const participant = {
        id: user.uid,
        name,
        normalizedName: normalizePseudo(name),
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        score: 0
      };
      await database.ref(`sessions/${code}/participants/${user.uid}`).set(participant);

      const localSession = { code, isAdmin: false, odparticipantId: user.uid, playerId: user.uid, name };
      sessionStorage.setItem('quizSession', JSON.stringify(localSession));
      localStorage.setItem('quizSession', JSON.stringify(localSession));
      location.href = `play.html?code=${encodeURIComponent(code)}`;
    } catch (error) {
      console.error('Inscription participant :', error);
      if (reservation?.committed) await reservation.ref.remove().catch(() => {});
      if (error?.message === 'SESSION_NOT_FOUND') showToast('Session introuvable', 'error');
      else if (error?.code === 'PERMISSION_DENIED') showToast('Accès Firebase refusé : publiez les nouvelles règles', 'error');
      else showToast('Impossible de rejoindre le quiz', 'error');
    } finally {
      joinInProgress = false;
      setSubmitState(submitButton, false);
    }
  }

  window.joinQuiz = event => joinParticipant(event, { code: 'sessionCode', name: 'playerName' });
  window.joinViaQR = event => joinParticipant(event, { code: 'qrSessionCode', name: 'qrPlayerName' });

  console.log('✅ Inscription participant atomique activée');
})();