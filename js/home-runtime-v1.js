(() => {
  'use strict';

  function toast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  window.showToast = window.showToast || toast;

  window.showJoinModal = () => document.getElementById('joinModal')?.classList.add('active');
  window.showCreateModal = () => {
    const modal = document.getElementById('createModal');
    modal?.classList.add('active');

    const user = window.QuizLiveFirebase?.organizerAuth?.currentUser;
    const login = document.getElementById('adminLoginStep');
    const create = document.getElementById('createSessionStep');
    if (login) login.style.display = user && !user.isAnonymous ? 'none' : 'block';
    if (create) create.style.display = user && !user.isAnonymous ? 'block' : 'none';
  };

  window.closeModals = () => document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));

  window.loginAdminForCreate = async () => {
    const auth = window.QuizLiveFirebase?.organizerAuth;
    const email = String(document.getElementById('createAdminEmail')?.value || '').trim();
    const password = String(document.getElementById('createAdminPass')?.value || '');
    const errorBox = document.getElementById('createLoginErr');
    if (errorBox) errorBox.textContent = '';

    if (!auth || !email || !password) {
      if (errorBox) errorBox.textContent = 'Email et mot de passe requis.';
      return;
    }

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, password);
      document.getElementById('adminLoginStep').style.display = 'none';
      document.getElementById('createSessionStep').style.display = 'block';
    } catch (error) {
      if (errorBox) errorBox.textContent = 'Adresse e-mail ou mot de passe incorrect.';
      console.error('Connexion organisateur:', error);
    }
  };

  document.addEventListener('click', event => {
    if (event.target.classList.contains('modal')) window.closeModals();
  });
})();
