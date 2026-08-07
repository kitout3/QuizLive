(() => {
  'use strict';

  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const ADMIN_BOOT_VERSION = '85';

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function uniqueCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const value = generateCode();
      const snap = await db.ref(`sessions/${value}`).once('value');
      if (!snap.exists()) return value;
    }
    throw new Error('Impossible de générer un code de session unique.');
  }

  async function participantLimit(user) {
    try {
      const entitlements = await window.QuizLiveEntitlements?.resolve?.(user, true);
      if (entitlements?.participantLimit) {
        return Math.max(1, Math.min(5000, Number(entitlements.participantLimit)));
      }

      const snap = await db.ref(`subscriptions/${user.uid}/participantLimit`).once('value');
      return Math.max(1, Math.min(5000, Number(snap.val() || 10)));
    } catch (_) {
      return 10;
    }
  }

  async function selectedGroup() {
    if (typeof window.QuizLiveGroups?.selectedGroupContext !== 'function') return null;
    return window.QuizLiveGroups.selectedGroupContext();
  }

  async function createSession(sessionName, adminName) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise.');

    await window.QuizLiveGroups?.acceptPendingEmailInvite?.(user);

    const [sessionCode, maxParticipants, group] = await Promise.all([
      uniqueCode(),
      participantLimit(user),
      selectedGroup()
    ]);

    const now = Date.now();
    const cleanName = String(sessionName || '').trim().slice(0, 120);
    const cleanAdmin = String(adminName || user.displayName || user.email || 'Organisateur')
      .trim()
      .slice(0, 120);

    if (!cleanName || !cleanAdmin) throw new Error('Veuillez remplir tous les champs.');

    const sessionData = {
      ownerUid: user.uid,
      ownerEmail: user.email || '',
      createdByUid: user.uid,
      createdByEmail: user.email || '',
      code: sessionCode,
      name: cleanName,
      admin: cleanAdmin,
      createdAt: now,
      updatedAt: now,
      status: 'waiting',
      currentQuestion: -1,
      questions: [],
      slides: [],
      presenterMode: false,
      maxParticipants
    };

    const organizerSummary = {
      code: sessionCode,
      name: cleanName,
      createdAt: now,
      updatedAt: now,
      status: 'waiting'
    };

    if (group) {
      sessionData.organizationId = group.organizationId;
      sessionData.organizationName = group.organizationName;
      sessionData.groupId = group.groupId;
      sessionData.groupName = group.groupName;

      organizerSummary.organizationId = group.organizationId;
      organizerSummary.groupId = group.groupId;
      organizerSummary.groupName = group.groupName;
    }

    const updates = {
      [`sessions/${sessionCode}`]: sessionData,
      [`organizerSessions/${user.uid}/${sessionCode}`]: organizerSummary
    };

    if (group) {
      updates[`groupSessions/${group.organizationId}/${group.groupId}/${sessionCode}`] = {
        code: sessionCode,
        name: cleanName,
        ownerUid: user.uid,
        ownerEmail: user.email || '',
        status: 'waiting',
        createdAt: now,
        updatedAt: now
      };
    }

    await db.ref().update(updates);

    localStorage.setItem('quizSession', JSON.stringify({
      code: sessionCode,
      isAdmin: true,
      name: cleanAdmin
    }));

    return sessionCode;
  }

  window.createQuizAfterLogin = async event => {
    event?.preventDefault?.();

    try {
      const sessionName = document.getElementById('sessionName')?.value || '';
      const adminName = document.getElementById('adminName')?.value || '';
      const sessionCode = await createSession(sessionName, adminName);
      window.location.assign(`admin.html?code=${encodeURIComponent(sessionCode)}&v=${ADMIN_BOOT_VERSION}`);
    } catch (error) {
      console.error('Création de session :', error);
      if (typeof window.showToast === 'function') {
        window.showToast(error.message || 'Création impossible.', 'error');
      } else {
        alert(error.message || 'Création impossible.');
      }
    }
  };

  window.createSessionAfterAuth = async () => {
    const pendingRaw = localStorage.getItem('pendingSession');
    if (!pendingRaw) return null;

    try {
      const pending = JSON.parse(pendingRaw);
      const sessionCode = await createSession(pending.sessionName, pending.adminName);
      localStorage.removeItem('pendingSession');
      history.replaceState({}, '', `admin.html?code=${encodeURIComponent(sessionCode)}&v=${ADMIN_BOOT_VERSION}`);
      return sessionCode;
    } catch (error) {
      console.error('Création après authentification :', error);
      if (typeof window.showToast === 'function') {
        window.showToast(error.message || 'Création impossible.', 'error');
      }
      return null;
    }
  };

  window.QuizLiveSessionCreate = { createSession, adminBootVersion: ADMIN_BOOT_VERSION };
})();
