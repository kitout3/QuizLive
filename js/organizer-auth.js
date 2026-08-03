// QuizLive - authentification et comptes organisateurs Firebase
(() => {
  'use strict';

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const cleanName = value => String(value || '').trim().substring(0, 80).replace(/[<>"'&]/g, '');

  function friendlyAuthError(error) {
    const messages = {
      'auth/email-already-in-use': 'Cette adresse email est déjà utilisée.',
      'auth/invalid-email': 'Adresse email invalide.',
      'auth/weak-password': 'Le mot de passe doit contenir au moins 8 caractères.',
      'auth/user-not-found': 'Aucun compte ne correspond à cette adresse email.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/invalid-credential': 'Email ou mot de passe incorrect.',
      'auth/popup-closed-by-user': 'La fenêtre Google a été fermée avant la connexion.',
      'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre de connexion Google.',
      'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cette adresse email et une autre méthode de connexion.'
    };
    return messages[error?.code] || error?.message || 'Une erreur est survenue.';
  }

  async function saveOrganizerProfile(user, displayName) {
    const ref = database.ref(`organizers/${user.uid}`);
    const snapshot = await ref.once('value');
    const existing = snapshot.val() || {};
    await ref.update({
      uid: user.uid,
      email: user.email || existing.email || '',
      displayName: cleanName(displayName || existing.displayName || user.displayName || user.email?.split('@')[0] || ''),
      role: 'organizer',
      active: existing.active !== false,
      provider: user.providerData?.[0]?.providerId || existing.provider || 'password',
      plan: existing.plan || 'free',
      createdAt: existing.createdAt || firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    localStorage.setItem('organizerUid', user.uid);
    localStorage.setItem('organizerEmail', user.email || '');
  }

  async function ensureOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    const snapshot = await database.ref(`organizers/${user.uid}`).once('value');
    if (!snapshot.exists()) {
      await saveOrganizerProfile(user, user.displayName);
      return true;
    }
    const profile = snapshot.val();
    if (profile.active === false) return false;
    localStorage.setItem('organizerUid', user.uid);
    return true;
  }

  async function signInWithGoogle() {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await firebase.auth().signInWithPopup(provider);
    await saveOrganizerProfile(credential.user, credential.user.displayName);
    return credential.user;
  }

  async function sendPasswordReset(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) throw new Error('Renseignez votre adresse email.');
    const actionCodeSettings = {
      url: `${location.origin}${location.pathname}`,
      handleCodeInApp: false
    };
    await firebase.auth().sendPasswordResetEmail(normalized, actionCodeSettings);
  }

  function injectOrganizerPanel() {
    if (!document.body.classList.contains('home-page') || document.getElementById('organizerAccountPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'organizerAccountPanel';
    panel.className = 'modal';
    panel.innerHTML = `<div class="modal-content" style="max-width:480px">
      <button class="modal-close" onclick="document.getElementById('organizerAccountPanel').classList.remove('active')">&times;</button>
      <h2>Compte organisateur</h2>
      <p style="color:var(--text-secondary);margin-bottom:18px">Créez votre espace ou connectez-vous pour gérer vos quiz.</p>
      <button id="orgGoogleBtn" class="btn-primary" style="width:100%;background:#fff;color:#202124;margin-bottom:16px">G Continuer avec Google</button>
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0 18px;color:var(--text-muted)"><span style="height:1px;background:rgba(255,255,255,.12);flex:1"></span>ou<span style="height:1px;background:rgba(255,255,255,.12);flex:1"></span></div>
      <div class="form-group"><label>Nom</label><input id="orgName" maxlength="80" placeholder="Votre nom"></div>
      <div class="form-group"><label>Email</label><input id="orgEmail" type="email" placeholder="email@exemple.com"></div>
      <div class="form-group"><label>Mot de passe</label><input id="orgPassword" type="password" minlength="8" placeholder="8 caractères minimum"></div>
      <div id="orgAuthError" class="error-message"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
        <button id="orgSignupBtn" class="btn-primary">Créer le compte</button>
        <button id="orgLoginBtn" class="btn-primary">Se connecter</button>
      </div>
      <button id="orgResetBtn" style="width:100%;margin-top:14px;background:none;border:none;color:var(--text-secondary);cursor:pointer">Mot de passe oublié ? Recevoir un lien</button>
    </div>`;
    document.body.appendChild(panel);

    const cards = document.querySelector('.action-cards');
    if (cards) {
      const card = document.createElement('div');
      card.className = 'action-card';
      card.innerHTML = '<div class="card-icon">👤</div><h3>Compte organisateur</h3><p>Créer un compte ou se connecter</p><div class="card-arrow">→</div>';
      card.onclick = () => panel.classList.add('active');
      cards.appendChild(card);
    }

    const errorBox = document.getElementById('orgAuthError');
    const setError = message => { errorBox.textContent = message || ''; };

    document.getElementById('orgGoogleBtn').onclick = async () => {
      setError('');
      try {
        await signInWithGoogle();
        showToast('Connexion Google réussie');
        panel.classList.remove('active');
        location.reload();
      } catch (error) {
        setError(friendlyAuthError(error));
      }
    };

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
        location.reload();
      } catch (error) {
        setError(friendlyAuthError(error));
      }
    };

    document.getElementById('orgLoginBtn').onclick = async () => {
      setError('');
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const credential = await firebase.auth().signInWithEmailAndPassword(normalizeEmail(document.getElementById('orgEmail').value), document.getElementById('orgPassword').value);
        if (!(await ensureOrganizer(credential.user))) throw new Error('Compte organisateur inactif.');
        showToast('Connexion réussie');
        panel.classList.remove('active');
        location.reload();
      } catch (error) {
        setError(friendlyAuthError(error));
      }
    };

    document.getElementById('orgResetBtn').onclick = async () => {
      setError('');
      try {
        await sendPasswordReset(document.getElementById('orgEmail').value);
        showToast('Un lien de modification du mot de passe vient de vous être envoyé');
      } catch (error) {
        setError(friendlyAuthError(error));
      }
    };
  }

  function installOwnedSessionCreation() {
    window.createQuizAfterLogin = async function createOwnedQuiz(event) {
      event?.preventDefault?.();
      const user = firebase.auth().currentUser;
      if (!user || !(await ensureOrganizer(user))) {
        showToast('Connectez-vous avec un compte organisateur', 'error');
        document.getElementById('organizerAccountPanel')?.classList.add('active');
        return;
      }

      const sessionName = cleanName(document.getElementById('sessionName')?.value);
      const adminName = cleanName(document.getElementById('adminName')?.value || user.displayName || user.email);
      if (!sessionName || !adminName) {
        showToast('Renseignez le nom de la session et de l’organisateur', 'error');
        return;
      }

      const organizerProfile = (await database.ref(`organizers/${user.uid}`).once('value')).val() || {};
      const organizationId = organizerProfile.defaultOrganizationId || '';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let attempt = 0; attempt < 20; attempt += 1) {
        code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        if (!(await database.ref(`sessions/${code}`).once('value')).exists()) break;
      }

      const createdAt = Date.now();
      const session = {
        code,
        name: sessionName,
        admin: adminName,
        ownerUid: user.uid,
        organizationId,
        organizerEmail: user.email || '',
        plan: organizerProfile.plan || 'free',
        createdAt,
        status: 'waiting',
        currentQuestion: -1,
        questions: [],
        participants: {},
        presenterMode: false,
        settings: { timerEnabled: true, musicEnabled: false, animationsEnabled: true }
      };

      const updates = {};
      updates[`sessions/${code}`] = session;
      updates[`organizerSessions/${user.uid}/${code}`] = { code, name: sessionName, createdAt, status: 'waiting', organizationId };
      await database.ref().update(updates);
      localStorage.setItem('quizSession', JSON.stringify({ code, isAdmin: true, name: adminName, ownerUid: user.uid }));
      location.href = `admin.html?code=${code}`;
    };
  }

  function protectAdminSession() {
    if (document.body?.dataset?.page !== 'admin') return;
    const code = new URLSearchParams(location.search).get('code');
    firebase.auth().onAuthStateChanged(async user => {
      if (!user || user.isAnonymous || !(await ensureOrganizer(user))) return;
      const snapshot = await database.ref(`sessions/${code}`).once('value');
      const session = snapshot.val();
      if (session?.ownerUid && session.ownerUid !== user.uid) {
        alert('Cette session appartient à un autre organisateur.');
        location.href = 'index.html';
      }
    });
  }

  window.QuizOrganizer = { ensureOrganizer, saveOrganizerProfile, signInWithGoogle, sendPasswordReset };
  injectOrganizerPanel();
  installOwnedSessionCreation();
  protectAdminSession();
})();
