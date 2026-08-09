// QuizLive — podium final Top 3 pour le mode présentation (v91)
(() => {
  'use strict';

  const VERSION = '91';

  function tr(fr, en) {
    const lang = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(lang).toLowerCase().startsWith('en') ? en : fr;
  }

  function escape(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
  }

  function scoreOf(player) {
    const score = Number(player?.score || 0);
    return Number.isFinite(score) ? Math.round(score) : 0;
  }

  function sortedPlayers(session) {
    return Object.values(session?.participants || {})
      .filter(player => player && player.name)
      .sort((a, b) => {
        const scoreDiff = scoreOf(b) - scoreOf(a);
        if (scoreDiff !== 0) return scoreDiff;
        return Number(a.joinedAt || 0) - Number(b.joinedAt || 0);
      });
  }

  function installStyles() {
    if (document.getElementById('quizliveFinalPodiumStyles')) return;

    const style = document.createElement('style');
    style.id = 'quizliveFinalPodiumStyles';
    style.textContent = `
      .ql-final-screen{min-height:calc(100vh - 80px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px 20px;box-sizing:border-box}
      .ql-final-kicker{font:700 1rem/1.2 'Space Grotesk',sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.62);margin-bottom:10px}
      .ql-final-title{font:800 clamp(2.4rem,5vw,5.2rem)/1 'Space Grotesk',sans-serif;margin:0;color:#fff;text-shadow:0 10px 36px rgba(99,102,241,.28)}
      .ql-final-subtitle{margin:14px 0 34px;color:rgba(255,255,255,.68);font-size:clamp(1rem,2vw,1.35rem)}
      .ql-podium{width:min(1080px,100%);display:grid;grid-template-columns:1fr 1.08fr 1fr;gap:22px;align-items:end;margin-top:12px}
      .ql-podium-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-width:0;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.04));border-radius:28px 28px 18px 18px;padding:28px 18px 22px;box-shadow:0 24px 70px rgba(0,0,0,.28);overflow:hidden;animation:qlPodiumIn .55s ease both}
      .ql-podium-card::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,rgba(255,255,255,.16),transparent 46%);pointer-events:none}
      .ql-podium-card.first{min-height:340px;border-color:rgba(250,204,21,.42);animation-delay:.08s}
      .ql-podium-card.second{min-height:285px;border-color:rgba(203,213,225,.34);animation-delay:.16s}
      .ql-podium-card.third{min-height:245px;border-color:rgba(251,146,60,.34);animation-delay:.24s}
      .ql-podium-medal{font-size:clamp(3rem,6vw,5rem);line-height:1;margin-bottom:12px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))}
      .ql-podium-rank{font:800 1rem/1 'Space Grotesk',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.58);margin-bottom:12px}
      .ql-podium-name{width:100%;font:800 clamp(1.45rem,3vw,2.5rem)/1.08 'Space Grotesk',sans-serif;color:#fff;overflow-wrap:anywhere}
      .ql-podium-score{margin-top:16px;font:800 clamp(1.4rem,3vw,2.2rem)/1 'Outfit',sans-serif;color:#fff}
      .ql-podium-points{display:block;margin-top:6px;font-size:.82rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.55)}
      .ql-final-thanks{margin-top:30px;color:rgba(255,255,255,.58);font-size:1rem}
      .ql-final-empty{padding:46px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.72);font-size:1.2rem}
      @keyframes qlPodiumIn{from{opacity:0;transform:translateY(30px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
      @media(max-width:760px){.ql-podium{grid-template-columns:1fr;align-items:stretch}.ql-podium-card.first,.ql-podium-card.second,.ql-podium-card.third{min-height:0}.ql-podium-card.first{order:1}.ql-podium-card.second{order:2}.ql-podium-card.third{order:3}}
    `;
    document.head.appendChild(style);
  }

  function podiumCard(player, rank) {
    if (!player) return '';

    const config = {
      1: { medal: '🥇', className: 'first', label: tr('1er', '1st') },
      2: { medal: '🥈', className: 'second', label: tr('2e', '2nd') },
      3: { medal: '🥉', className: 'third', label: tr('3e', '3rd') }
    }[rank];

    return `
      <div class="ql-podium-card ${config.className}">
        <div class="ql-podium-medal">${config.medal}</div>
        <div class="ql-podium-rank">${config.label}</div>
        <div class="ql-podium-name">${escape(player.name)}</div>
        <div class="ql-podium-score">
          ${scoreOf(player)}
          <span class="ql-podium-points">${tr('points', 'points')}</span>
        </div>
      </div>
    `;
  }

  function renderFinalPodium(session) {
    installStyles();

    const container = document.getElementById('presenterContent');
    if (!container) return;

    const players = sortedPlayers(session);
    const top3 = players.slice(0, 3);

    if (!top3.length) {
      container.innerHTML = `
        <div class="ql-final-screen">
          <div class="ql-final-kicker">${tr('Quiz terminé', 'Quiz finished')}</div>
          <h1 class="ql-final-title">🏆 ${tr('Classement final', 'Final ranking')}</h1>
          <div class="ql-final-empty">${tr('Aucun participant classé.', 'No ranked participant.')}</div>
        </div>
      `;
      return;
    }

    // Sur un podium horizontal, le 2e est à gauche, le 1er au centre, le 3e à droite.
    const podiumOrder = [
      top3[1] ? podiumCard(top3[1], 2) : '',
      top3[0] ? podiumCard(top3[0], 1) : '',
      top3[2] ? podiumCard(top3[2], 3) : ''
    ].join('');

    container.innerHTML = `
      <div class="ql-final-screen">
        <div class="ql-final-kicker">${escape(session?.name || 'QuizLive')}</div>
        <h1 class="ql-final-title">🏆 ${tr('Les grands gagnants', 'Winners')}</h1>
        <p class="ql-final-subtitle">${tr('Top 3 du classement final', 'Final Top 3')}</p>
        <div class="ql-podium">${podiumOrder}</div>
        <div class="ql-final-thanks">
          ${players.length} ${players.length > 1 ? tr('participants', 'participants') : tr('participant', 'participant')} · ${tr('Merci à tous !', 'Thank you everyone!')}
        </div>
      </div>
    `;
  }

  const originalRenderPresenterView = window.renderPresenterView;

  if (typeof originalRenderPresenterView !== 'function') {
    console.error('Podium QuizLive v91 : renderPresenterView introuvable.');
    return;
  }

  window.renderPresenterView = session => {
    if (session?.status === 'finished') {
      renderFinalPodium(session);
      return;
    }
    return originalRenderPresenterView(session);
  };

  window.QuizLiveFinalPodium = {
    version: VERSION,
    render: renderFinalPodium
  };
})();
