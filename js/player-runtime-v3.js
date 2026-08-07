(() => {
  'use strict';

  const VERSION = '83';

  function parseStored(raw) {
    try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
  }

  function getStoredSession() {
    const sessionValue = parseStored(sessionStorage.getItem('quizSession'));
    if (sessionValue?.code) return sessionValue;

    // Compatibilité avec les anciennes versions qui utilisaient localStorage.
    const legacy = parseStored(localStorage.getItem('quizSession'));
    if (legacy?.code) {
      sessionStorage.setItem('quizSession', JSON.stringify(legacy));
      return legacy;
    }
    return {};
  }

  function showJoin(code) {
    const modal = document.getElementById('joinViaQRModal');
    const input = document.getElementById('qrSessionCode');
    if (input) input.value = code || '';
    modal?.classList.add('active');
  }

  function installLoadingWatchdog(code) {
    const container = document.getElementById('playerContent');
    if (!container) return;

    setTimeout(() => {
      const text = container.textContent || '';
      if (!/Connexion au quiz|Connecting to quiz/i.test(text)) return;

      container.innerHTML = `
        <div class="waiting-screen">
          <div class="waiting-icon">⚠️</div>
          <div class="waiting-text">Le quiz met trop de temps à charger.</div>
          <button type="button" class="btn-primary" id="quizPlayerRetry" style="margin-top:20px">Réessayer</button>
        </div>`;
      document.getElementById('quizPlayerRetry')?.addEventListener('click', () => {
        location.replace(`play.html?code=${encodeURIComponent(code)}&v=${VERSION}`);
      });
    }, 12000);
  }

  window.initPlayer = function initPlayerV83() {
    const code = String(new URLSearchParams(location.search).get('code') || '')
      .trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

    if (code.length !== 6) {
      location.replace('index.html?v=83');
      return;
    }

    installLoadingWatchdog(code);

    const stored = getStoredSession();
    const storedId = stored.participantId || stored.odparticipantId || stored.playerId || '';

    if (!storedId || stored.code !== code) {
      showJoin(code);
      return;
    }

    if (typeof window.startPlayerSession === 'function') {
      window.startPlayerSession(code, storedId, stored.name || 'Joueur');
    } else {
      console.error('startPlayerSession indisponible');
      showJoin(code);
    }
  };

  window.QuizLivePlayerRuntime = { version: VERSION, getStoredSession };
})();
