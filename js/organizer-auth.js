// QuizLive - authentification organisateur unifiée
(() => {
  'use strict';

  const cleanName = value => String(value || '').trim().slice(0, 80).replace(/[<>"'&]/g, '');
  const normalizeEmail = value => String(value || '').trim().toLowerCase();

  function authMessage(error) {
    const messages = {
      'auth/email-already-in-use': 'Cette adresse email est déjà utilisée.',
      'auth/invalid-email': 'Adresse email invalide.',
      'auth/weak-password': 'Le mot de passe doit contenir au moins 8 caractères.',
      'auth/user-not-found': 'Aucun compte ne correspond à cette adresse email.',
      'auth/wrong-password': 'Email ou mot de passe incorrect.',
      'auth/invalid-credential': 'Email ou mot de passe incorrect.',
      'auth/unauthorized-domain': 'Le domaine GitHub Pages doit être autorisé dans Firebase Authentication.',
      'auth/operation-not-allowed': 'La connexion Google doit être activée dans Firebase Authentication.'
    };
    return messages[error?.code] || error?.message || 'Authentification impossible.';
  }

  async function saveOrganizerProfile(user, displayName) {
    if (!user || user.isAnonymous) throw new Error('Compte organisateur invalide.');
    const ref = database.ref(`organizers/${user.uid}`);
    const snap = await ref.once('value');
    const current = snap.val() || {};
    await ref.update({
      uid: user.uid,
      email: user.email || current.email || '',
      displayName: cleanName(displayName || current.displayName || user.displayName || user.email?.split('@')[0]),
      role: 'organizer',
      active: current.active !== false,
      provider: user.providerData?.[0]?.providerId || current.provider || 'password',
      plan: current.plan || 'free',
      createdAt: current.createdAt || firebase.database.ServerValue.TIMESTAMP,
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
    sessionStorage.setItem('quizliveGoogleReturn', '1');
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return firebase.auth().signInWithRedirect(provider);
  }

  async function completeGoogleRedirect() {
    try {
      const result = await firebase.auth().getRedirectResult();
      const user = result?.user;
      if (!user) return;
      await saveOrganizerProfile(user, user.displayName);
      sessionStorage.removeItem('quizliveGoogleReturn');
      if (typeof showToast === 'function') showToast('Connexion Google réussie');
    } catch (error) {
      sessionStorage.removeItem('quizliveGoogleReturn');
      console.error('Retour Google :', error);
      sessionStorage.setItem('quizliveAuthError', authMessage(error));
    }
  }

  async function sendPasswordReset(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) throw new Error('Renseignez votre adresse email.');
    await firebase.auth().sendPasswordResetEmail(normalized, {
      url: `${location.origin}${location.pathname}`,
      handleCodeInApp: false
    });
  }

  function installOwnedSessionCreation() {
    window.createQuizAfterLogin = async event => {
      event?.preventDefault?.();
      const user = firebase.auth().currentUser;
      if (!user || !(await ensureOrganizer(user))) throw new Error('Connexion organisateur requise.');
      const sessionName = cleanName(document.getElementById('sessionName')?.value);
      const adminName = cleanName(document.getElementById('adminName')?.value || user.displayName || user.email);
      if (!sessionName || !adminName) {
        if (typeof showToast === 'function') showToast('Renseignez le nom de la session et de l’organisateur', 'error');
        return;
      }
      const profile = (await database.ref(`organizers/${user.uid}`).once('value')).val() || {};
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let attempt = 0; attempt < 30; attempt += 1) {
        code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        if (!(await database.ref(`sessions/${code}`).once('value')).exists()) break;
      }
      const createdAt = Date.now();
      const session = {
        code, name: sessionName, admin: adminName, ownerUid: user.uid,
        organizerEmail: user.email || '', organizationId: profile.defaultOrganizationId || '',
        plan: profile.plan || 'free', createdAt, status: 'waiting', currentQuestion: -1,
        questions: [], slides: [], participants: {}, presenterMode: false,
        settings: { timerEnabled: true, musicEnabled: false, animationsEnabled: true }
      };
      const updates = {};
      updates[`sessions/${code}`] = session;
      updates[`organizerSessions/${user.uid}/${code}`] = {
        code, name: sessionName, createdAt, status: 'waiting', organizationId: session.organizationId
      };
      await database.ref().update(updates);
      localStorage.setItem('quizSession', JSON.stringify({ code, isAdmin: true, name: adminName, ownerUid: user.uid }));
      location.href = `admin.html?code=${code}`;
    };
  }

  window.QuizOrganizer = {
    ensureOrganizer,
    saveOrganizerProfile,
    signInWithGoogle,
    sendPasswordReset,
    authMessage
  };

  installOwnedSessionCreation();
  completeGoogleRedirect();
})();
