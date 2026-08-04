// QuizLive - parcours d'accueil Organisateur / Participant
(() => {
  'use strict';
  if (!document.body.classList.contains('home-page')) return;

  const cards = document.querySelector('.action-cards');
  if (!cards) return;
  let selectedRole = null;

  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function card(icon, title, text, action) {
    return `<button type="button" class="action-card" data-action="${action}" style="text-align:left;width:100%;color:inherit"><div class="card-icon">${icon}</div><h3>${title}</h3><p>${text}</p><div class="card-arrow">→</div></button>`;
  }

  function bindActions() {
    cards.querySelectorAll('[data-action]').forEach(element => element.onclick = () => handleAction(element.dataset.action));
  }

  async function isOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    return window.QuizOrganizer?.ensureOrganizer ? window.QuizOrganizer.ensureOrganizer(user) : true;
  }

  function renderRoleChoice() {
    selectedRole = null;
    cards.innerHTML = card('🧑‍💼', 'Organisateur', 'Créer, administrer et analyser vos quiz', 'organizer') + card('🚀', 'Participant', 'Rejoindre une partie avec un code à 6 chiffres', 'participant');
    bindActions();
  }

  function renderParticipant() {
    selectedRole = 'participant';
    cards.innerHTML = card('🚀', 'Rejoindre un quiz', 'Saisissez le code communiqué par l’organisateur', 'join') + card('←', 'Changer de profil', 'Retour au choix Organisateur / Participant', 'back');
    bindActions();
  }

  async function renderOrganizer() {
    selectedRole = 'organizer';
    const user = firebase.auth().currentUser;
    if (await isOrganizer(user)) {
      cards.innerHTML = card('🎯', 'Créer un quiz', 'Lancer une nouvelle session sans vous reconnecter', 'createQuiz') + card('📊', 'Mon espace', 'Quiz, statistiques, organisation et abonnement', 'dashboard') + card('↪', 'Se déconnecter', `Compte connecté : ${esc(user.email || user.displayName || '')}`, 'logout') + card('←', 'Changer de profil', 'Retour au choix Organisateur / Participant', 'back');
    } else {
      cards.innerHTML = card('🔐', 'Se connecter', 'Google ou adresse email et mot de passe', 'login') + card('✨', 'Créer un compte', 'Google ou nom, email et mot de passe', 'signup') + card('←', 'Changer de profil', 'Retour au choix Organisateur / Participant', 'back');
    }
    bindActions();
  }

  function openCreateQuiz() {
    if (typeof showCreateModal !== 'function') return;
    showCreateModal();
    setTimeout(() => {
      const loginStep = document.getElementById('adminLoginStep');
      const createStep = document.getElementById('createSessionStep');
      if (loginStep) loginStep.style.display = 'none';
      if (createStep) createStep.style.display = 'block';
    }, 0);
  }

  async function handleAction(action) {
    if (action === 'organizer') return renderOrganizer();
    if (action === 'participant') return renderParticipant();
    if (action === 'back') return renderRoleChoice();
    if (action === 'join') return showJoinModal();
    if (action === 'login') return location.assign('login.html');
    if (action === 'signup') return location.assign('register.html');
    if (action === 'createQuiz') return openCreateQuiz();
    if (action === 'dashboard') return location.assign('dashboard.html');
    if (action === 'logout') {
      await firebase.auth().signOut();
      localStorage.removeItem('organizerUid');
      localStorage.removeItem('organizerEmail');
      return renderOrganizer();
    }
  }

  firebase.auth().onAuthStateChanged(() => {
    if (selectedRole === 'organizer') renderOrganizer();
  });

  renderRoleChoice();
})();
