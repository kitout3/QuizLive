// QuizLive - accueil organisateur simplifié avec ancien parcours de création
(() => {
  'use strict';
  if (!document.body.classList.contains('home-page')) return;

  const cards = document.querySelector('.action-cards');
  if (!cards) return;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));

  function card(icon, title, text, action) {
    return `<button type="button" class="action-card" data-action="${action}" style="text-align:left;width:100%;color:inherit"><div class="card-icon">${icon}</div><h3>${title}</h3><p>${text}</p><div class="card-arrow">→</div></button>`;
  }

  async function isOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    try {
      return window.QuizOrganizer?.ensureOrganizer ? Boolean(await window.QuizOrganizer.ensureOrganizer(user)) : true;
    } catch (_) {
      return false;
    }
  }

  function openLegacyCreate() {
    if (typeof window.showCreateModal !== 'function') {
      location.assign('admin.html');
      return;
    }
    window.showCreateModal();
    setTimeout(() => {
      const loginStep = document.getElementById('adminLoginStep');
      const createStep = document.getElementById('createSessionStep');
      if (loginStep) loginStep.style.display = 'none';
      if (createStep) createStep.style.display = 'block';
    }, 0);
  }

  async function renderHome() {
    const user = firebase.auth().currentUser;
    const connected = await isOrganizer(user);
    cards.innerHTML = connected ? [
      card('🎯', 'Créer un quiz', 'Utilisez l’éditeur classique QuizLive', 'create'),
      card('🚀', 'Rejoindre une session', 'Entrez directement un code de session à 6 caractères', 'join'),
      card('📊', 'Mon espace', 'Retrouvez vos quiz, statistiques et paramètres', 'dashboard'),
      card('↪', 'Se déconnecter', `Compte connecté : ${esc(user.email || user.displayName || '')}`, 'logout')
    ].join('') : [
      card('🔐', 'Se connecter', 'Accédez à vos quatre actions principales', 'login'),
      card('✨', 'Créer un compte', 'Créez votre compte organisateur', 'register'),
      card('🚀', 'Rejoindre une session', 'Entrez directement un code de session à 6 caractères', 'join')
    ].join('');

    cards.querySelectorAll('[data-action]').forEach(button => {
      button.onclick = () => handleAction(button.dataset.action);
    });

    if (connected && new URLSearchParams(location.search).get('create') === '1') {
      history.replaceState({}, '', 'index.html');
      openLegacyCreate();
    }
  }

  async function handleAction(action) {
    if (action === 'login') return location.assign('login.html?return=index.html');
    if (action === 'register') return location.assign('register.html?return=index.html');
    if (action === 'join') return typeof window.showJoinModal === 'function' ? window.showJoinModal() : null;
    if (action === 'dashboard') return location.assign('dashboard.html');
    if (action === 'create') return openLegacyCreate();
    if (action === 'logout') {
      await firebase.auth().signOut();
      localStorage.removeItem('organizerUid');
      localStorage.removeItem('organizerEmail');
      return renderHome();
    }
  }

  firebase.auth().onAuthStateChanged(() => renderHome());
  renderHome();
})();
