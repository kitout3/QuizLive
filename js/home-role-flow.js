// QuizLive - parcours d'accueil Organisateur / Participant
(() => {
  'use strict';

  if (!document.body.classList.contains('home-page')) return;

  const cards = document.querySelector('.action-cards');
  if (!cards) return;

  const esc = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let selectedRole = null;
  let authMode = 'login';
  let googleBusy = false;

  function card(icon, title, text, action, id = '') {
    return `<button type="button" class="action-card" ${id ? `id="${id}"` : ''} data-action="${action}" style="text-align:left;width:100%;color:inherit">
      <div class="card-icon">${icon}</div><h3>${title}</h3><p>${text}</p><div class="card-arrow">→</div>
    </button>`;
  }

  function bindActions() {
    cards.querySelectorAll('[data-action]').forEach(element => {
      element.onclick = () => handleAction(element.dataset.action);
    });
  }

  async function isOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    return window.QuizOrganizer?.ensureOrganizer ? window.QuizOrganizer.ensureOrganizer(user) : true;
  }

  function renderRoleChoice() {
    selectedRole = null;
    cards.innerHTML = [
      card('🧑‍💼', 'Organisateur', 'Créer, administrer et analyser vos quiz', 'organizer'),
      card('🚀', 'Participant', 'Rejoindre une partie avec un code à 6 chiffres', 'participant')
    ].join('');
    bindActions();
  }

  function renderParticipant() {
    selectedRole = 'participant';
    cards.innerHTML = `
      ${card('🚀', 'Rejoindre un quiz', 'Saisissez le code à 6 chiffres communiqué par l’organisateur', 'join')}
      ${card('←', 'Changer de profil', 'Retour au choix Organisateur / Participant', 'back')}`;
    bindActions();
  }

  async function renderOrganizer() {
    selectedRole = 'organizer';
    const user = firebase.auth().currentUser;
    if (await isOrganizer(user)) {
      cards.innerHTML = `
        ${card('🎯', 'Créer un quiz', 'Lancer une nouvelle session sans vous reconnecter', 'createQuiz')}
        ${card('📊', 'Espace organisateur', 'Organisations, quiz, historique et statistiques', 'dashboard')}
        ${card('↪', 'Se déconnecter', `Compte connecté : ${esc(user.email || user.displayName || '')}`, 'logout')}
        ${card('←', 'Changer de profil', 'Retour au choix Organisateur / Participant', 'back')}`;
    } else {
      cards.innerHTML = `
        ${card('🔐', 'Se connecter', 'Google ou adresse email et mot de passe', 'login')}
        ${card('✨', 'Créer un compte', 'Google ou nom, email et mot de passe', 'signup')}
        ${card('←', 'Changer de profil', 'Retour au choix Organisateur / Participant', 'back')}`;
    }
    bindActions();
  }

  function ensureAuthModal() {
    let modal = document.getElementById('roleAuthModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'roleAuthModal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content" style="max-width:480px">
      <button class="modal-close" id="roleAuthClose">&times;</button>
      <h2 id="roleAuthTitle"></h2>
      <p id="roleAuthSubtitle" style="color:var(--text-secondary);margin-bottom:18px"></p>
      <button id="roleGoogleBtn" class="btn-primary" style="width:100%;background:#fff;color:#202124;margin-bottom:16px">G Continuer avec Google</button>
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0 18px;color:var(--text-muted)"><span style="height:1px;background:rgba(255,255,255,.12);flex:1"></span>ou<span style="height:1px;background:rgba(255,255,255,.12);flex:1"></span></div>
      <div class="form-group" id="roleNameGroup"><label>Nom</label><input id="roleAuthName" maxlength="80" placeholder="Votre nom"></div>
      <div class="form-group"><label>Email</label><input id="roleAuthEmail" type="email" placeholder="email@exemple.com"></div>
      <div class="form-group"><label>Mot de passe</label><input id="roleAuthPassword" type="password" minlength="8" placeholder="8 caractères minimum"></div>
      <div id="roleAuthError" style="color:#fca5a5;min-height:22px"></div>
      <button id="roleSubmitBtn" class="btn-primary" style="width:100%;margin-top:10px"></button>
      <button id="roleForgotBtn" style="width:100%;margin-top:12px;background:none;border:none;color:var(--text-secondary);cursor:pointer">Mot de passe oublié ?</button>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#roleAuthClose').onclick = () => modal.classList.remove('active');
    return modal;
  }

  function openAuth(mode) {
    authMode = mode;
    const modal = ensureAuthModal();
    modal.querySelector('#roleAuthTitle').textContent = mode === 'login' ? 'Se connecter' : 'Créer un compte';
    modal.querySelector('#roleAuthSubtitle').textContent = mode === 'login' ? 'Accédez à votre espace organisateur.' : 'Créez votre compte organisateur.';
    modal.querySelector('#roleNameGroup').style.display = mode === 'signup' ? 'block' : 'none';
    modal.querySelector('#roleSubmitBtn').textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    modal.querySelector('#roleForgotBtn').style.display = mode === 'login' ? 'block' : 'none';
    modal.querySelector('#roleAuthError').textContent = '';
    modal.classList.add('active');

    modal.querySelector('#roleGoogleBtn').onclick = googleAuth;
    modal.querySelector('#roleSubmitBtn').onclick = emailAuth;
    modal.querySelector('#roleForgotBtn').onclick = resetPassword;
  }

  async function googleAuth() {
    if (googleBusy) return;
    googleBusy = true;
    const modal = ensureAuthModal();
    const button = modal.querySelector('#roleGoogleBtn');
    const errorBox = modal.querySelector('#roleAuthError');
    button.disabled = true;
    button.textContent = 'Connexion Google en cours…';
    errorBox.textContent = '';
    try {
      await window.QuizOrganizer.signInWithGoogle();
      modal.classList.remove('active');
      await renderOrganizer();
      showToast(authMode === 'signup' ? 'Compte Google créé' : 'Connexion Google réussie');
    } catch (error) {
      errorBox.textContent = error.code === 'auth/cancelled-popup-request' ? 'Une fenêtre Google est déjà ouverte.' : (error.message || 'Connexion Google impossible.');
    } finally {
      googleBusy = false;
      button.disabled = false;
      button.textContent = 'G Continuer avec Google';
    }
  }

  async function emailAuth() {
    const modal = ensureAuthModal();
    const name = modal.querySelector('#roleAuthName').value.trim();
    const email = modal.querySelector('#roleAuthEmail').value.trim().toLowerCase();
    const password = modal.querySelector('#roleAuthPassword').value;
    const errorBox = modal.querySelector('#roleAuthError');
    errorBox.textContent = '';
    try {
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      let credential;
      if (authMode === 'signup') {
        if (!name || password.length < 8) throw new Error('Nom et mot de passe de 8 caractères minimum requis.');
        credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName: name });
        await window.QuizOrganizer.saveOrganizerProfile(credential.user, name);
      } else {
        credential = await firebase.auth().signInWithEmailAndPassword(email, password);
        await window.QuizOrganizer.ensureOrganizer(credential.user);
      }
      modal.classList.remove('active');
      await renderOrganizer();
      showToast(authMode === 'signup' ? 'Compte créé' : 'Connexion réussie');
    } catch (error) {
      errorBox.textContent = error.message || 'Authentification impossible.';
    }
  }

  async function resetPassword() {
    const modal = ensureAuthModal();
    const email = modal.querySelector('#roleAuthEmail').value.trim();
    const errorBox = modal.querySelector('#roleAuthError');
    try {
      await window.QuizOrganizer.sendPasswordReset(email);
      showToast('Un lien de modification du mot de passe vous a été envoyé');
    } catch (error) {
      errorBox.textContent = error.message || 'Envoi impossible.';
    }
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
    if (action === 'login' || action === 'signup') return openAuth(action);
    if (action === 'createQuiz') return openCreateQuiz();
    if (action === 'dashboard') return window.QuizPlatform?.showDashboard?.();
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