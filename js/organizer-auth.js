// QuizLive - comptes organisateurs et sessions propriétaires
(() => {
  'use strict';

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const cleanName = value => String(value || '').trim().substring(0, 80).replace(/[<>"'&]/g, '');

  async function saveOrganizerProfile(user, displayName) {
    const ref = database.ref(`organizers/${user.uid}`);
    const snapshot = await ref.once('value');
    const existing = snapshot.val() || {};
    await ref.update({
      uid: user.uid,
      email: user.email || existing.email || '',
      displayName: cleanName(displayName || existing.displayName || user.displayName || ''),
      role: 'organizer',
      active: existing.active !== false,
      createdAt: existing.createdAt || firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    localStorage.setItem('organizerUid', user.uid);
    localStorage.setItem('organizerEmail', user.email || '');
  }

  async function ensureOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    const snapshot = await database.ref(`organizers/${user.uid}`).once('value');
    const profile = snapshot.val();
    if (!profile || profile.active === false) return false;
    localStorage.setItem('organizerUid', user.uid);
    return true;
  }

  function openOrganizerPanel() {
    injectOrganizerPanel();
    document.getElementById('organizerAccountPanel')?.classList.add('active');
  }

  function injectOrganizerPanel() {
    if (!document.body.classList.contains('home-page') || document.getElementById('organizerAccountPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'organizerAccountPanel';
    panel.className = 'modal';
    panel.innerHTML = `<div class="modal-content" style="max-width:460px">
      <button class="modal-close" onclick="document.getElementById('organizerAccountPanel').classList.remove('active')">&times;</button>
      <h2>Compte organisateur</h2>
      <div class="form-group"><label>Nom</label><input id="orgName" maxlength="80" placeholder="Nom de l'organisateur"></div>
      <div class="form-group"><label>Email</label><input id="orgEmail" type="email" placeholder="email@exemple.com"></div>
      <div class="form-group"><label>Mot de passe</label><input id="orgPassword" type="password" minlength="8" placeholder="8 caractères minimum"></div>
      <div id="orgAuthError" class="error-message"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
        <button id="orgSignupBtn" class="btn-primary">Créer le compte</button>
        <button id="orgLoginBtn" class="btn-primary">Se connecter</button>
      </div>
      <button id="orgResetBtn" style="width:100%;margin-top:12px;background:none;border:none;color:var(--text-secondary);cursor:pointer">Mot de passe oublié</button>
    </div>`;
    document.body.appendChild(panel);

    const cards = document.querySelector('.action-cards');
    if (cards && !document.getElementById('organizerAccountCard')) {
      const card = document.createElement('div');
      card.id = 'organizerAccountCard';
      card.className = 'action-card';
      card.innerHTML = '<div class="card-icon">👤</div><h3>Compte organisateur</h3><p>Créer un compte ou se connecter</p><div class="card-arrow">→</div>';
      card.onclick = openOrganizerPanel;
      cards.appendChild(card);
    }

    const errorBox = document.getElementById('orgAuthError');
    const setError = message => { errorBox.textContent = message || ''; };

    document.getElementById('orgSignupBtn').onclick = async () => {
      setError('');
      const name = cleanName(document.getElementById('orgName').value);
      const email = normalizeEmail(document.getElementById('orgEmail').value);
      const password = document.getElementById('orgPassword').value;
      if (!name || !email || password.length < 8) {
        setError('Nom, email et mot de passe de 8 caractères minimum requis.');
        return;
      }
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName: name });
        await saveOrganizerProfile(credential.user, name);
        showToast('Compte organisateur créé');
        panel.classList.remove('active');
      } catch (error) {
        setError(error.message);
      }
    };

    document.getElementById('orgLoginBtn').onclick = async () => {
      setError('');
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const credential = await firebase.auth().signInWithEmailAndPassword(
          normalizeEmail(document.getElementById('orgEmail').value),
          document.getElementById('orgPassword').value
        );
        if (!(await ensureOrganizer(credential.user))) throw new Error('Compte organisateur inactif.');
        showToast('Connexion réussie');
        panel.classList.remove('active');
      } catch (error) {
        setError(error.message);
      }
    };

    document.getElementById('orgResetBtn').onclick = async () => {
      try {
        const email = normalizeEmail(document.getElementById('orgEmail').value);
        if (!email) throw new Error('Renseignez votre email.');
        await firebase.auth().sendPasswordResetEmail(email);
        showToast('Email de réinitialisation envoyé');
      } catch (error) {
        setError(error.message);
      }
    };
  }

  async function generateUniqueCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const snapshot = await database.ref(`sessions/${code}`).once('value');
      if (!snapshot.exists()) return code;
    }
    throw new Error('Impossible de générer un code de session unique');
  }

  async function createOwnedSession(event) {
    event?.preventDefault?.();
    const user = firebase.auth().currentUser;
    if (!user || !(await ensureOrganizer(user))) {
      showToast('Connectez-vous avec un compte organisateur', 'error');
      openOrganizerPanel();
      return;
    }

    const sessionName = cleanName(document.getElementById('sessionName')?.value);
    const adminName = cleanName(document.getElementById('adminName')?.value || user.displayName || user.email);
    if (!sessionName || !adminName) {
      showToast('Renseignez le nom de la session et de l’organisateur', 'error');
      return;
    }

    try {
      const code = await generateUniqueCode();
      const createdAt = firebase.database.ServerValue.TIMESTAMP;
      const session = {
        code,
        name: sessionName,
        admin: adminName,
        ownerUid: user.uid,
        organizerEmail: user.email || '',
        createdAt,
        status: 'waiting',
        currentQuestion: -1,
        questions: [],
        participants: {},
        presenterMode: false
      };

      const updates = {};
      updates[`sessions/${code}`] = session;
      updates[`organizerSessions/${user.uid}/${code}`] = {
        code,
        name: sessionName,
        createdAt,
        status: 'waiting'
      };
      await database.ref().update(updates);

      localStorage.setItem('quizSession', JSON.stringify({
        code,
        isAdmin: true,
        name: adminName,
        ownerUid: user.uid
      }));
      window.location.href = `admin.html?code=${code}`;
    } catch (error) {
      console.error('Erreur création session organisateur :', error);
      showToast(`Création impossible : ${error.message}`, 'error');
    }
  }

  function installOwnedSessionCreation() {
    window.createQuizAfterLogin = createOwnedSession;

    window.showCreateModal = async function showOrganizerCreateModal() {
      const user = firebase.auth().currentUser;
      if (!user || !(await ensureOrganizer(user))) {
        openOrganizerPanel();
        return;
      }
      const modal = document.getElementById('createModal');
      modal?.classList.add('active');
      const loginStep = document.getElementById('adminLoginStep');
      const createStep = document.getElementById('createSessionStep');
      if (loginStep) loginStep.style.display = 'none';
      if (createStep) createStep.style.display = 'block';
      const adminInput = document.getElementById('adminName');
      if (adminInput && !adminInput.value) adminInput.value = user.displayName || user.email || '';
    };

    window.loginAdminForCreate = async function loginOrganizerForCreate() {
      const email = normalizeEmail(document.getElementById('createAdminEmail')?.value);
      const password = document.getElementById('createAdminPass')?.value || '';
      const errorBox = document.getElementById('createLoginErr');
      if (errorBox) errorBox.textContent = '';
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
        if (!(await ensureOrganizer(credential.user))) throw new Error('Compte organisateur requis.');
        document.getElementById('adminLoginStep').style.display = 'none';
        document.getElementById('createSessionStep').style.display = 'block';
      } catch (error) {
        if (errorBox) errorBox.textContent = error.message;
      }
    };
  }

  function protectAdminSession() {
    if (document.body?.dataset?.page !== 'admin') return;
    const code = new URLSearchParams(location.search).get('code');

    firebase.auth().onAuthStateChanged(async user => {
      if (!user || user.isAnonymous || !(await ensureOrganizer(user))) {
        if (typeof showAdminLogin === 'function') showAdminLogin(true);
        return;
      }

      const snapshot = await database.ref(`sessions/${code}`).once('value');
      const session = snapshot.val();
      if (!session) {
        showToast('Session introuvable', 'error');
        location.href = 'index.html';
        return;
      }
      if (session.ownerUid !== user.uid) {
        alert('Cette session appartient à un autre organisateur.');
        location.href = 'index.html';
        return;
      }

      if (typeof setLoginError === 'function') setLoginError('');
      if (typeof showAdminLogin === 'function') showAdminLogin(false);
      if (!window.__quizOrganizerAdminInitialized && typeof initAdmin === 'function') {
        window.__quizOrganizerAdminInitialized = true;
        initAdmin();
      }
    });
  }

  window.QuizOrganizer = {
    ensureOrganizer,
    saveOrganizerProfile,
    createOwnedSession
  };

  injectOrganizerPanel();
  installOwnedSessionCreation();
  protectAdminSession();
})();