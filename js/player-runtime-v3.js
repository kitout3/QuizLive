(() => {
  'use strict';

  function getStoredSession() {
    const raw = sessionStorage.getItem('quizSession') || '{}';
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }

  function showJoin(code) {
    const modal = document.getElementById('joinViaQRModal');
    const input = document.getElementById('qrSessionCode');
    if (input) input.value = code || '';
    modal?.classList.add('active');
  }

  window.initPlayer = function initPlayerV4() {
    const code = String(new URLSearchParams(location.search).get('code') || '')
      .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

    if (code.length !== 6) {
      location.replace('index.html?v=58');
      return;
    }

    const services = window.QuizLiveFirebase;
    const auth = services?.participantAuth;

    if (!auth) {
      console.error('Firebase participant indisponible');
      showJoin(code);
      return;
    }

    const stored = getStoredSession();
    const storedId = stored.participantId || stored.odparticipantId || stored.playerId || '';

    if (!storedId || stored.code !== code) {
      showJoin(code);
      return;
    }

    auth.onAuthStateChanged(user => {
      if (!user || !user.isAnonymous || user.uid !== storedId) {
        sessionStorage.removeItem('quizSession');
        sessionStorage.removeItem('quizliveParticipantUid');
        showJoin(code);
        return;
      }

      sessionStorage.setItem('quizliveParticipantUid', user.uid);

      if (typeof window.startPlayerSession === 'function') {
        window.startPlayerSession(code, user.uid, stored.name || 'Joueur');
      } else {
        console.error('startPlayerSession indisponible');
        showJoin(code);
      }
    });
  };
})();
