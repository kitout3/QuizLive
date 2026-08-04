// QuizLive - accueil simplifié : organiser ou rejoindre directement
(() => {
  'use strict';
  if (!document.body.classList.contains('home-page')) return;

  const cards = document.querySelector('.action-cards');
  if (!cards) return;
  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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

  async function renderHome() {
    const user = firebase.auth().currentUser;
    const connected = await isOrganizer(user);
    cards.innerHTML = connected ? [
      card('🎯', 'Créer un quiz', 'Construisez un nouveau quiz dans l’éditeur', 'create'),
      card('🚀', 'Rejoindre une session', 'Entrez directement un code de session à 6 caractères', 'join'),
      card('📊', 'Mon espace', 'Retrouvez vos quiz, statistiques et paramètres', 'dashboard'),
      card('↪', 'Se déconnecter', `Compte connecté : ${esc(user.email || user.displayName || '')}`, 'logout')
    ].join('') : [
      card('🔐', 'Se connecter', 'Accédez à votre espace organisateur', 'login'),
      card('✨', 'Créer un compte', 'Créez votre compte organisateur', 'register'),
      card('🚀', 'Rejoindre une session', 'Entrez directement un code de session à 6 caractères', 'join')
    ].join('');

    cards.querySelectorAll('[data-action]').forEach(button => {
      button.onclick = () => handleAction(button.dataset.action);
    });
  }

  async function handleAction(action) {
    if (action === 'login') return location.assign('login.html?return=dashboard.html');
    if (action === 'register') return location.assign('register.html?return=dashboard.html');
    if (action === 'join') return typeof window.showJoinModal === 'function' ? window.showJoinModal() : null;
    if (action === 'dashboard') return location.assign('dashboard.html');
    if (action === 'create') return location.assign('editor.html');
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
