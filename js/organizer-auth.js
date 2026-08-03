// QuizLive - comptes organisateurs Firebase
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

  function injectOrganizerPanel() {
    if (!document.body.classList.contains('home-page')) return;
    if (document.getElementById('organizerAccountPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'organizerAccountPanel';
    panel.className = 'modal';
    panel.innerHTML = `
      <div class="modal-content" style="max-width:460px">
        <button class="modal-close" onclick="document.getElementById('organizerAccountPanel').classList.remove('active')">&times;</button>
        <h2>Compte organisateur</h2>
        <div class="form-group"><label>Nom</label><input id="orgName" type="text" maxlength="80" placeholder="Nom de l'organisateur"></div>
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

    const actionCards = document.querySelector('.action-cards');
    if (actionCards) {
      const card = document.createElement('div');
      card.className = 'action-card';
      card.innerHTML = '<div class="card-icon">👤</div><h3>Compte organisateur</h3><p>Créer un compte ou se connecter</p><div class="card-arrow">→</div>';
      card.onclick = () => panel.classList.add('active');
      actionCards.appendChild(card);
    }

    const errorBox = document.getElementById('orgAuthError');
    const setError = message => { errorBox.textContent = message || ''; };

    document.getElementById('orgSignupBtn').onclick = async () => {
      setError('');
      const name = cleanName(document.getElementById('orgName').value);
      const email = normalizeEmail(document.getElementById('orgEmail').value);
      const password = document.getElementById('orgPassword').value;
      if (!name || !email || password.length < 8) { setError('Nom, email et mot de passe de 8 caractères minimum requis.'); return; }
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await credential.user.updateProfile({ displayName: name });
        await saveOrganizerProfile(credential.user, name);
        showToast('Compte organisateur créé');
        panel.classList.remove('active');
      } catch (error) { setError(error.message); }
    };

    document.getElementById('orgLoginBtn').onclick = async () => {
      setError('');
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const credential = await firebase.auth().signInWithEmailAndPassword(normalizeEmail(document.getElementById('orgEmail').value), document.getElementById('orgPassword').value);
        const allowed = await ensureOrganizer(credential.user);
        if (!allowed) throw new Error('Ce compte n’est pas un compte organisateur actif.');
        showToast('Connexion organisateur réussie');
        panel.classList.remove('active');
      } catch (error) { setError(error.message); }
    };

    document.getElementById('orgResetBtn').onclick = async () => {
      try {
        const email = normalizeEmail(document.getElementById('orgEmail').value);
        if (!email) throw new Error('Renseignez votre email.');
        await firebase.auth().sendPasswordResetEmail(email);
        showToast('Email de réinitialisation envoyé');
      } catch (error) { setError(error.message); }
    };
  }

  function wrapSessionCreation() {
    const original = window.createQuizAfterLogin;
    if (typeof original !== 'function') return;
    window.createQuizAfterLogin = async function organizerCreateQuiz(event) {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous || !(await ensureOrganizer(user))) {
        showToast('Connectez-vous avec un compte organisateur', 'error');
        injectOrganizerPanel();
        document.getElementById('organizerAccountPanel')?.classList.add('active');
        return;
      }
      const before = new Set();
      const snap = await database.ref('sessions').once('value');
      Object.keys(snap.val() || {}).forEach(code => before.add(code));
      await original(event);
      setTimeout(async () => {
        const latest = await database.ref('sessions').once('value');
        for (const [code, session] of Object.entries(latest.val() || {})) {
          if (!before.has(code) && !session.ownerUid) {
            await database.ref(`sessions/${code}`).update({ ownerUid: user.uid, organizerEmail: user.email || '' });
          }
        }
      }, 500);
    };
  }

  async function protectAdminSession() {
    if (document.body?.dataset?.page !== 'admin') return;
    const code = new URLSearchParams(location.search).get('code');
    firebase.auth().onAuthStateChanged(async user => {
      if (!user || user.isAnonymous) return;
      const allowed = await ensureOrganizer(user);
      if (!allowed) return;
      const snap = await database.ref(`sessions/${code}`).once('value');
      const session = snap.val();
      if (session?.ownerUid && session.ownerUid !== user.uid) {
        alert('Cette session appartient à un autre organisateur.');
        location.href = 'index.html';
      }
    });
  }

  window.QuizOrganizer = { ensureOrganizer, saveOrganizerProfile };
  injectOrganizerPanel();
  wrapSessionCreation();
  protectAdminSession();
})();