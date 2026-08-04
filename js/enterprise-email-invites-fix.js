(() => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const db = window.QuizLiveFirebase?.organizerDatabase || database;

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const emailKey = email => btoa(unescape(encodeURIComponent(normalizeEmail(email))))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  let currentUser = null;

  function notify(text, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(text, type);
      return;
    }

    const content = document.getElementById('dashboardContent');
    if (!content) return;

    const notice = document.createElement('div');
    notice.className = `dashboard-notice ${type}`;
    notice.textContent = text;
    content.prepend(notice);
    setTimeout(() => notice.remove(), 4000);
  }

  async function ownerContext() {
    if (!currentUser) throw new Error('Compte organisateur non connecté.');

    const [profileSnap, linksSnap] = await Promise.all([
      db.ref(`organizers/${currentUser.uid}`).once('value'),
      db.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);

    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';
    if (!organizationId) throw new Error('Aucun espace entreprise sélectionné.');

    const [organizationSnap, membersSnap, groupsSnap] = await Promise.all([
      db.ref(`organizations/${organizationId}`).once('value'),
      db.ref(`organizationMembers/${organizationId}`).once('value'),
      db.ref(`organizationGroups/${organizationId}`).once('value')
    ]);

    const organization = organizationSnap.val() || {};
    if (organization.ownerUid !== currentUser.uid) {
      throw new Error('Seul le propriétaire peut inviter un collaborateur.');
    }

    return {
      organizationId,
      organization,
      members: membersSnap.val() || {},
      groups: groupsSnap.val() || {}
    };
  }

  async function createInvite(groupName, rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Adresse e-mail invalide.');
    }

    const context = await ownerContext();
    const activeEmails = new Set(
      Object.values(context.members)
        .map(member => normalizeEmail(member?.email))
        .filter(Boolean)
    );

    const pending = Object.values(context.organization.pendingInvites || {})
      .filter(invite => invite?.status === 'pending' && !activeEmails.has(normalizeEmail(invite.email)));

    if (Object.keys(context.members).length + pending.length >= MAX_ACCOUNTS) {
      throw new Error(`La limite de ${MAX_ACCOUNTS} comptes, invitations incluses, est atteinte.`);
    }

    if (activeEmails.has(email)) {
      throw new Error('Cette adresse appartient déjà à un membre de l’entreprise.');
    }

    if (pending.some(invite => normalizeEmail(invite.email) === email)) {
      throw new Error('Une invitation est déjà en attente pour cette adresse.');
    }

    const groupEntry = Object.entries(context.groups).find(([, group]) =>
      String(group?.name || '').trim().toLowerCase() === String(groupName || '').trim().toLowerCase()
    );

    if (!groupEntry) {
      throw new Error('Groupe introuvable. Rechargez la page puis réessayez.');
    }

    const [groupId, group] = groupEntry;
    const key = emailKey(email);
    const now = firebase.database.ServerValue.TIMESTAMP;
    const invite = {
      email,
      emailKey: key,
      organizationId: context.organizationId,
      organizationName: context.organization.name || 'Entreprise',
      groupId,
      groupName: group.name || 'Groupe',
      createdBy: currentUser.uid,
      status: 'pending',
      createdAt: now
    };

    await db.ref().update({
      [`organizationEmailInvites/${key}`]: invite,
      [`organizations/${context.organizationId}/pendingInvites/${key}`]: {
        email,
        emailKey: key,
        groupId,
        groupName: group.name || 'Groupe',
        status: 'pending',
        createdAt: now
      }
    });

    window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
  }

  document.addEventListener('submit', async event => {
    const form = event.target.closest('.enterprise-email-invite-form');
    if (!form) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button[type="submit"]');
    const groupName = form.closest('.enterprise-group-card')?.querySelector('h3')?.textContent || '';
    const submittedEmail = normalizeEmail(input?.value);

    if (button) button.disabled = true;

    try {
      await createInvite(groupName, submittedEmail);
      notify(`${submittedEmail} est en attente de sa première connexion.`);
      if (input) input.value = '';
    } catch (error) {
      notify(error.message || 'Invitation impossible.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }, true);

  auth.onAuthStateChanged(user => {
    currentUser = user && !user.isAnonymous ? user : null;
  });

  window.QuizLiveEnterpriseInvites = {
    emailKey,
    createInvite
  };
})();