// QuizLive - authentification organisateur unifiée
(() => {
  'use strict';

  const GOOGLE_CLIENT_ID = '875684500848-5mpgg8bpu5obi520qr0jqc7ngvnrqej0.apps.googleusercontent.com';
  const cleanName = value => String(value || '').trim().slice(0, 80).replace(/[<>"'&]/g, '');
  const cleanEmail = value => String(value || '').trim().toLowerCase();
  let googleLoginPending = false;
  let googleSdkPromise = null;

  function authMessage(error) {
    const map = {
      'auth/email-already-in-use': 'Cette adresse email est déjà utilisée.',
      'auth/invalid-email': 'Adresse email invalide.',
      'auth/weak-password': 'Le mot de passe doit contenir au moins 8 caractères.',
      'auth/user-not-found': 'Aucun compte ne correspond à cette adresse email.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/invalid-credential': 'Identifiants Google invalides ou expirés.',
      'auth/unauthorized-domain': 'Le domaine kitout3.github.io n’est pas autorisé.',
      'auth/operation-not-allowed': 'La connexion Google n’est pas activée dans Firebase.',
      'auth/account-exists-with-different-credential': 'Un compte existe déjà avec cette adresse email et une autre méthode de connexion.',
      'google/origin-not-allowed': 'Ajoutez https://kitout3.github.io dans les origines JavaScript autorisées du client OAuth Google.',
      'google/popup-closed': 'La fenêtre Google a été fermée avant la fin de la connexion.'
    };
    return map[error?.code] || error?.message || 'Authentification impossible.';
  }

  function loadGoogleIdentityServices() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googleSdkPromise) return googleSdkPromise;

    googleSdkPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Chargement de Google Identity Services impossible.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Chargement de Google Identity Services impossible.'));
      document.head.appendChild(script);
    });

    return googleSdkPromise;
  }

  async function saveOrganizerProfile(user, displayName) {
    if (!user || user.isAnonymous) throw new Error('Compte organisateur invalide.');
    const ref = database.ref(`organizers/${user.uid}`);
    const snap = await ref.once('value');
    const existing = snap.val() || {};
    await ref.update({
      uid: user.uid,
      email: user.email || existing.email || '',
      displayName: cleanName(displayName || user.displayName || existing.displayName || user.email?.split('@')[0]),
      role: 'organizer',
      active: existing.active !== false,
      provider: user.providerData?.[0]?.providerId || existing.provider || 'google.com',
      plan: existing.plan || 'free',
      createdAt: existing.createdAt || firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    localStorage.setItem('organizerUid', user.uid);
    localStorage.setItem('organizerEmail', user.email || '');
  }

  async function ensureOrganizer(user) {
    if (!user || user.isAnonymous) return false;
    const snap = await database.ref(`organizers/${user.uid}`).once('value');
    if (!snap.exists()) await saveOrganizerProfile(user, user.displayName);
    else if (snap.val()?.active === false) return false;
    localStorage.setItem('organizerUid', user.uid);
    localStorage.setItem('organizerEmail', user.email || '');
    return true;
  }

  async function signInWithGoogle() {
    if (googleLoginPending) {
      const error = new Error('Une tentative de connexion Google est déjà en cours.');
      error.code = 'auth/cancelled-popup-request';
      throw error;
    }

    googleLoginPending = true;
    try {
      await loadGoogleIdentityServices();
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

      const tokenResponse = await new Promise((resolve, reject) => {
        let completed = false;
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: response => {
            completed = true;
            if (response?.error) {
              const error = new Error(response.error_description || response.error);
              error.code = response.error === 'popup_closed_by_user' ? 'google/popup-closed' : `google/${response.error}`;
              reject(error);
              return;
            }
            if (!response?.access_token) {
              reject(new Error('Google n’a retourné aucun jeton de connexion.'));
              return;
            }
            resolve(response);
          },
          error_callback: response => {
            completed = true;
            const error = new Error(response?.message || response?.type || 'Connexion Google interrompue.');
            error.code = response?.type === 'popup_closed' ? 'google/popup-closed' : `google/${response?.type || 'unknown'}`;
            reject(error);
          }
        });

        tokenClient.requestAccessToken({ prompt: 'select_account' });

        setTimeout(() => {
          if (!completed) {
            const error = new Error('La connexion Google a expiré. Vérifiez les origines JavaScript autorisées.');
            error.code = 'google/origin-not-allowed';
            reject(error);
          }
        }, 60000);
      });

      const firebaseCredential = firebase.auth.GoogleAuthProvider.credential(null, tokenResponse.access_token);
      const result = await firebase.auth().signInWithCredential(firebaseCredential);
      await saveOrganizerProfile(result.user, result.user.displayName);
      localStorage.setItem('quizliveHomeRole', 'organizer');
      return result.user;
    } finally {
      googleLoginPending = false;
    }
  }

  async function sendPasswordReset(email) {
    const value = cleanEmail(email);
    if (!value) throw new Error('Renseignez votre adresse email.');
    await firebase.auth().sendPasswordResetEmail(value, {
      url: `${location.origin}${location.pathname}`,
      handleCodeInApp: false
    });
  }

  async function createOrganizer(email, password, name) {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const credential = await firebase.auth().createUserWithEmailAndPassword(cleanEmail(email), password);
    await credential.user.updateProfile({ displayName: cleanName(name) });
    await saveOrganizerProfile(credential.user, name);
    return credential.user;
  }

  async function loginOrganizer(email, password) {
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const credential = await firebase.auth().signInWithEmailAndPassword(cleanEmail(email), password);
    if (!(await ensureOrganizer(credential.user))) throw new Error('Compte organisateur inactif.');
    return credential.user;
  }

  function installOwnedSessionCreation() {
    window.createQuizAfterLogin = async event => {
      event?.preventDefault?.();
      const user = firebase.auth().currentUser;
      if (!user || !(await ensureOrganizer(user))) {
        if (typeof showToast === 'function') showToast('Connectez-vous avec un compte organisateur', 'error');
        return;
      }
      const name = cleanName(document.getElementById('sessionName')?.value);
      const admin = cleanName(document.getElementById('adminName')?.value || user.displayName || user.email);
      if (!name || !admin) {
        if (typeof showToast === 'function') showToast('Renseignez le nom du quiz et de l’organisateur', 'error');
        return;
      }
      const profile = (await database.ref(`organizers/${user.uid}`).once('value')).val() || {};
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let attempt = 0; attempt < 30; attempt++) {
        code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        if (!(await database.ref(`sessions/${code}`).once('value')).exists()) break;
      }
      const createdAt = Date.now();
      const session = {
        code, name, admin, ownerUid: user.uid,
        organizerEmail: user.email || '',
        organizationId: profile.defaultOrganizationId || '',
        plan: profile.plan || 'free',
        createdAt, status: 'waiting', currentQuestion: -1,
        questions: [], participants: {}, presenterMode: false,
        settings: { timerEnabled: true, musicEnabled: false, animationsEnabled: true }
      };
      const updates = {};
      updates[`sessions/${code}`] = session;
      updates[`organizerSessions/${user.uid}/${code}`] = { code, name, createdAt, status: 'waiting', organizationId: session.organizationId };
      await database.ref().update(updates);
      const local = { code, isAdmin: true, name: admin, ownerUid: user.uid };
      localStorage.setItem('quizSession', JSON.stringify(local));
      sessionStorage.setItem('quizSession', JSON.stringify(local));
      location.href = `admin.html?code=${code}`;
    };
  }

  function protectAdminSession() {
    if (document.body?.dataset?.page !== 'admin') return;
    const code = new URLSearchParams(location.search).get('code');
    firebase.auth().onAuthStateChanged(async user => {
      if (!user || user.isAnonymous || !code) return;
      const snap = await database.ref(`sessions/${code}`).once('value');
      const session = snap.val();
      if (session?.ownerUid && session.ownerUid !== user.uid) {
        alert('Cette session appartient à un autre organisateur.');
        location.href = 'index.html';
      }
    });
  }

  window.QuizOrganizer = {
    authMessage,
    saveOrganizerProfile,
    ensureOrganizer,
    signInWithGoogle,
    sendPasswordReset,
    createOrganizer,
    loginOrganizer
  };

  installOwnedSessionCreation();
  protectAdminSession();
})();