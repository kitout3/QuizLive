// QuizLive — garde anti-chargement infini pour « Mes quiz » (v83)
(() => {
  'use strict';

  const VERSION = '83';
  const GROUP_TIMEOUT_MS = 10000;

  function emptyResult() {
    return {
      context: {
        organizationId: '',
        organization: {},
        membership: {},
        groups: [],
        isOwner: false,
        isEnterpriseMember: false
      },
      sessions: []
    };
  }

  function withTimeout(promise, milliseconds) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('GROUP_LOADING_TIMEOUT')), milliseconds);
      })
    ]).finally(() => clearTimeout(timer));
  }

  function patchGroups() {
    const groups = window.QuizLiveGroups;
    if (!groups || groups.__quizLoadingGuard83) return Boolean(groups);

    const originalLoadSharedSessions = groups.loadSharedSessions?.bind(groups);
    if (typeof originalLoadSharedSessions !== 'function') return false;

    groups.loadSharedSessions = async (...args) => {
      try {
        return await withTimeout(originalLoadSharedSessions(...args), GROUP_TIMEOUT_MS);
      } catch (error) {
        if (error?.message === 'GROUP_LOADING_TIMEOUT') {
          console.warn('Chargement des groupes trop long : affichage des quiz personnels sans bloquer la page.');
          return emptyResult();
        }
        console.warn('Quiz de groupe indisponibles :', error);
        return emptyResult();
      }
    };

    groups.__quizLoadingGuard83 = true;
    return true;
  }

  function installVisualWatchdog() {
    if (document.body?.dataset?.page !== 'dashboard') return;

    const content = document.getElementById('dashboardContent');
    if (!content) return;

    let lastLoadingAt = 0;
    const observer = new MutationObserver(() => {
      const loading = content.querySelector('.dashboard-loading');
      const title = document.getElementById('dashboardTitle')?.textContent?.trim() || '';
      if (!loading || !/quiz/i.test(title)) {
        lastLoadingAt = 0;
        return;
      }

      if (!lastLoadingAt) lastLoadingAt = Date.now();
      if (Date.now() - lastLoadingAt < 14000) return;

      content.innerHTML = `
        <article class="dashboard-card">
          <h2>Mes quiz</h2>
          <p class="dashboard-muted">Le chargement des groupes a pris trop de temps.</p>
          <button type="button" class="btn-primary" id="retryQuizLoading">Réessayer</button>
        </article>`;
      document.getElementById('retryQuizLoading')?.addEventListener('click', () => location.reload());
      lastLoadingAt = 0;
    });

    observer.observe(content, { childList: true, subtree: true });
    setInterval(() => {
      if (content.querySelector('.dashboard-loading')) {
        content.dispatchEvent(new Event('quizlive-loading-check'));
        const title = document.getElementById('dashboardTitle')?.textContent?.trim() || '';
        if (/quiz/i.test(title) && !lastLoadingAt) lastLoadingAt = Date.now();
        if (/quiz/i.test(title) && lastLoadingAt && Date.now() - lastLoadingAt >= 14000) {
          content.innerHTML = `
            <article class="dashboard-card">
              <h2>Mes quiz</h2>
              <p class="dashboard-muted">Le chargement a été interrompu pour éviter un écran bloqué.</p>
              <button type="button" class="btn-primary" id="retryQuizLoading">Réessayer</button>
            </article>`;
          document.getElementById('retryQuizLoading')?.addEventListener('click', () => location.reload());
          lastLoadingAt = 0;
        }
      }
    }, 1000);
  }

  let attempts = 0;
  const timer = setInterval(() => {
    if (patchGroups() || ++attempts > 120) clearInterval(timer);
  }, 50);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installVisualWatchdog, { once: true });
  } else {
    installVisualWatchdog();
  }

  window.QuizLiveQuizLoadingGuard = { version: VERSION, patchGroups };
})();
