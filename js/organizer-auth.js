// QuizLive - comptes organisateurs Firebase
(() => {
  'use strict';
  const normalizeEmail = v => String(v || '').trim().toLowerCase();
  const cleanName = v => String(v || '').trim().substring(0, 80).replace(/[<>"'&]/g, '');

  async function saveOrganizerProfile(user, displayName) {
    const ref = database.ref(`organizers/${user.uid}`);
    const snap = await ref.once('value');
    const existing = snap.val() || {};
    await ref.update({
      uid: user.uid,
      email: user.email || existing.email || '',
      displayName: cleanName(displayName || existing.displayName || user.displayName || ''),
      role: 'organizer', active: existing.active !== false,
      createdAt: existing.createdAt || firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    localStorage.setItem('organizerUid', user.uid);
    localStorage.setItem('organizerEmail', user.email || '');
  }

  async function ensureOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    const snap = await database.ref(`organizers/${user.uid}`).once('value');
    const profile = snap.val();
    if (!profile || profile.active === false) return false;
    localStorage.setItem('organizerUid', user.uid);
    return true;
  }

  function injectOrganizerPanel() {
    if (!document.body.classList.contains('home-page') || document.getElementById('organizerAccountPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'organizerAccountPanel'; panel.className = 'modal';
    panel.innerHTML = `<div class="modal-content" style="max-width:460px">
      <button class="modal-close" onclick="document.getElementById('organizerAccountPanel').classList.remove('active')">&times;</button>
      <h2>Compte organisateur</h2>
      <div class="form-group"><label>Nom</label><input id="orgName" maxlength="80"></div>
      <div class="form-group"><label>Email</label><input id="orgEmail" type="email"></div>
      <div class="form-group"><label>Mot de passe</label><input id="orgPassword" type="password" minlength="8"></div>
      <div id="orgAuthError" class="error-message"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px">
        <button id="orgSignupBtn" class="btn-primary">Créer le compte</button>
        <button id="orgLoginBtn" class="btn-primary">Se connecter</button>
      </div>
      <button id="orgResetBtn" style="width:100%;margin-top:12px;background:none;border:none;color:var(--text-secondary);cursor:pointer">Mot de passe oublié</button>
    </div>`;
    document.body.appendChild(panel);
    const cards = document.querySelector('.action-cards');
    if (cards) {
      const card = document.createElement('div'); card.className = 'action-card';
      card.innerHTML = '<div class="card-icon">👤</div><h3>Compte organisateur</h3><p>Créer un compte ou se connecter</p><div class="card-arrow">→</div>';
      card.onclick = () => panel.classList.add('active'); cards.appendChild(card);
    }
    const errorBox = document.getElementById('orgAuthError');
    const setError = m => { errorBox.textContent = m || ''; };
    document.getElementById('orgSignupBtn').onclick = async () => {
      setError(''); const name = cleanName(orgName.value); const email = normalizeEmail(orgEmail.value); const password = orgPassword.value;
      if (!name || !email || password.length < 8) { setError('Nom, email et mot de passe de 8 caractères minimum requis.'); return; }
      try { await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); const c = await firebase.auth().createUserWithEmailAndPassword(email, password); await c.user.updateProfile({displayName:name}); await saveOrganizerProfile(c.user, name); showToast('Compte organisateur créé'); panel.classList.remove('active'); location.reload(); } catch(e) { setError(e.message); }
    };
    document.getElementById('orgLoginBtn').onclick = async () => {
      setError(''); try { await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); const c = await firebase.auth().signInWithEmailAndPassword(normalizeEmail(orgEmail.value), orgPassword.value); if (!(await ensureOrganizer(c.user))) throw new Error('Compte organisateur inactif.'); showToast('Connexion réussie'); panel.classList.remove('active'); location.reload(); } catch(e) { setError(e.message); }
    };
    document.getElementById('orgResetBtn').onclick = async () => { try { const email = normalizeEmail(orgEmail.value); if (!email) throw new Error('Renseignez votre email.'); await firebase.auth().sendPasswordResetEmail(email); showToast('Email envoyé'); } catch(e) { setError(e.message); } };
  }

  function installOwnedSessionCreation() {
    window.createQuizAfterLogin = async function(event) {
      event?.preventDefault?.();
      const user = firebase.auth().currentUser;
      if (!user || !(await ensureOrganizer(user))) { showToast('Connectez-vous avec un compte organisateur', 'error'); document.getElementById('organizerAccountPanel')?.classList.add('active'); return; }
      const sessionName = cleanName(document.getElementById('sessionName')?.value);
      const adminName = cleanName(document.getElementById('adminName')?.value || user.displayName || user.email);
      if (!sessionName || !adminName) { showToast('Renseignez le nom de la session et de l’organisateur', 'error'); return; }
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        code = Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        const exists = await database.ref(`sessions/${code}`).once('value');
        if (!exists.exists()) break;
      }
      const session = {
        code, name: sessionName, admin: adminName, ownerUid: user.uid,
        organizerEmail: user.email || '', createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'waiting', currentQuestion: -1, questions: [], participants: {}, presenterMode: false
      };
      await database.ref(`sessions/${code}`).set(session);
      localStorage.setItem('quizSession', JSON.stringify({code, isAdmin:true, name:adminName, ownerUid:user.uid}));
      location.href = `admin.html?code=${code}`;
    };
  }

  function protectAdminSession() {
    if (document.body?.dataset?.page !== 'admin') return;
    const code = new URLSearchParams(location.search).get('code');
    firebase.auth().onAuthStateChanged(async user => {
      if (!user || user.isAnonymous || !(await ensureOrganizer(user))) return;
      const snap = await database.ref(`sessions/${code}`).once('value');
      const session = snap.val();
      if (session?.ownerUid && session.ownerUid !== user.uid) { alert('Cette session appartient à un autre organisateur.'); location.href = 'index.html'; }
    });
  }

  window.QuizOrganizer = { ensureOrganizer, saveOrganizerProfile };
  injectOrganizerPanel(); installOwnedSessionCreation(); protectAdminSession();
})();