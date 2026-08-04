(() => {
  'use strict';

  function code() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function participantLimit(uid) {
    try {
      const snap = await database.ref(`subscriptions/${uid}/participantLimit`).once('value');
      return Math.max(1, Math.min(5000, Number(snap.val() || 10)));
    } catch (_) {
      return 10;
    }
  }

  async function groupContext() {
    if (typeof window.QuizLiveGroupSharing?.selectedGroupContext !== 'function') return null;
    return window.QuizLiveGroupSharing.selectedGroupContext();
  }

  async function createSession(sessionName, adminName) {
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise.');

    const sessionCode = code();
    const now = Date.now();
    const maxParticipants = await participantLimit(user.uid);
    const group = await groupContext();

    const sessionData = {
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      code: sessionCode,
      name: String(sessionName || '').trim().slice(0, 120),
      admin: String(adminName || user.displayName || user.email || 'Organisateur').trim().slice(0, 120),
      createdAt: now,
      updatedAt: now,
      status: 'waiting',
      currentQuestion: -1,
      questions: [],
      slides: [],
      presenterMode: false,
      maxParticipants
    };

    if (group) {
      sessionData.organizationId = group.organizationId;
      sessionData.organizationName = group.organizationName;
      sessionData.groupId = group.groupId;
      sessionData.groupName = group.groupName;
    }

    const organizerSummary = {
      code: sessionCode,
      name: sessionData.name,
      createdAt: now,
      updatedAt: now,
      status: 'waiting'
    };

    if (group) {
      organizerSummary.organizationId = group.organizationId;
      organizerSummary.groupId = group.groupId;
      organizerSummary.groupName = group.groupName;
    }

    const updates = {};
    updates[`sessions/${sessionCode}`] = sessionData;
    updates[`organizerSessions/${user.uid}/${sessionCode}`] = organizerSummary;

    if (group) {
      updates[`groupSessions/${group.organizationId}/${group.groupId}/${sessionCode}`] = {
        code: sessionCode,
        name: sessionData.name,
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        status: 'waiting',
        createdAt: now,
        updatedAt: now
      };
    }

    await database.ref().update(updates);

    localStorage.setItem('quizSession', JSON.stringify({
      code: sessionCode,
      isAdmin: true,
      name: sessionData.admin
    }));

    return sessionCode;
  }

  window.createQuizAfterLogin = async event => {
    event?.preventDefault?.();
    try {
      const sessionName = document.getElementById('sessionName')?.value || '';
      const adminName = document.getElementById('adminName')?.value || '';
      if (!sessionName.trim() || !adminName.trim()) throw new Error('Veuillez remplir tous les champs.');
      const sessionCode = await createSession(sessionName, adminName);
      window.location.assign(`admin.html?code=${encodeURIComponent(sessionCode)}`);
    } catch (error) {
      console.error('Session create v2:', error);
      if (typeof window.showToast === 'function') window.showToast(error.message || 'Création impossible.', 'error');
      else alert(error.message || 'Création impossible.');
    }
  };

  window.createSessionAfterAuth = async () => {
    const pendingRaw = localStorage.getItem('pendingSession');
    if (!pendingRaw) return null;
    try {
      const pending = JSON.parse(pendingRaw);
      const sessionCode = await createSession(pending.sessionName, pending.adminName);
      localStorage.removeItem('pendingSession');
      history.replaceState({}, '', `admin.html?code=${encodeURIComponent(sessionCode)}`);
      return sessionCode;
    } catch (error) {
      console.error('Session create after auth v2:', error);
      if (typeof window.showToast === 'function') window.showToast(error.message || 'Création impossible.', 'error');
      return null;
    }
  };

  window.QuizLiveSessionCreate = { createSession };
})();
