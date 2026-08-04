(() => {
  'use strict';

  function getStoredSession() {
    const raw = sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession') || '{}';
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }

  function showJoin(code) {
    const modal = document.getElementById('joinViaQRModal');
    const input = document.getElementById('qrSessionCode');
    if (input) input.value = code || '';
    modal?.classList.add('active');
  }

  window.initPlayer = function initPlayerV3() {
    const code = String(new URLSearchParams(location.search).get('code') || '')
      .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

    if (code.length !== 6) {
      location.replace('index.html');
      return;
    }

    const stored = getStoredSession();
    const storedId = stored.participantId || stored.odparticipantId || stored.playerId || '';

    if (!storedId || stored.code !== code) {
      showJoin(code);
      return;
    }

    firebase.auth().onAuthStateChanged(async user => {
      if (!user) {
        showJoin(code);
        return;
      }

      if (!user.isAnonymous || user.uid !== storedId) {
        sessionStorage.removeItem('quizSession');
        showJoin(code);
        return;
      }

      sessionStorage.setItem('quizliveParticipantUid', user.uid);
      sessionStorage.setItem('quizSession', JSON.stringify(stored));

      if (typeof window.startPlayerSession === 'function') {
        window.startPlayerSession(code, user.uid, stored.name || 'Joueur');
      } else {
        console.error('startPlayerSession indisponible');
        showJoin(code);
      }
    });
  };
})();
