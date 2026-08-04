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
  let accepting = false;

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

    if (!groupEntry) throw new Error('Groupe introuvable. Rechargez la page puis réessayez.');

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

    const updates = {};
    updates[`organizationEmailInvites/${key}`] = invite;
    updates[`organizations/${context.organizationId}/pendingInvites/${key}`] = {
      email,
      emailKey: key,
      groupId,
      groupName: group.name || 'Groupe',
      status: 'pending',
      createdAt: now
    };

    await db.ref().update(updates);
    window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
  }

  async function acceptInvite(user) {
    if (!user?.email || accepting) return false;
    accepting = true;

    try {
      const email = normalizeEmail(user.email);
      const key = emailKey(email);
      const inviteSnap = await db.ref(`organizationEmailInvites/${key}`).once('value');
      const invite = inviteSnap.val();

      if (!invite || invite.status !== 'pending' || normalizeEmail(invite.email) !== email) {
        return false;
      }

      const now = firebase.database.ServerValue.TIMESTAMP;
      const updates = {};

      updates[`organizationMembers/${invite.organizationId}/${user.uid}/uid`] = user.uid;
      updates[`organizationMembers/${invite.organizationId}/${user.uid}/email`] = email;
      updates[`organizationMembers/${invite.organizationId}/${user.uid}/displayName`] = user.displayName || email;
      updates[`organizationMembers/${invite.organizationId}/${user.uid}/role`] = 'member';
      updates[`organizationMembers/${invite.organizationId}/${user.uid}/groupIds/${invite.groupId}`] = true;
      updates[`organizationMembers/${invite.organizationId}/${user.uid}/joinedAt`] = now;

      updates[`organizationGroupMembers/${invite.organizationId}/${invite.groupId}/${user.uid}`] = {
        uid: user.uid,
        role: 'member',
        joinedAt: now
      };

      updates[`userOrganizations/${user.uid}/${invite.organizationId}/role`] = 'member';
      updates[`userOrganizations/${user.uid}/${invite.organizationId}/name`] = invite.organizationName || 'Entreprise';
      updates[`userOrganizations/${user.uid}/${invite.organizationId}/type`] = 'company';
      updates[`userOrganizations/${user.uid}/${invite.organizationId}/plan`] = 'enterprise';
      updates[`userOrganizations/${user.uid}/${invite.organizationId}/groupId`] = invite.groupId;
      updates[`userOrganizations/${user.uid}/${invite.organizationId}/groupName`] = invite.groupName || 'Groupe';
      updates[`userOrganizations/${user.uid}/${invite.organizationId}/groupIds/${invite.groupId}`] = true;

      updates[`organizers/${user.uid}/plan`] = 'enterprise';
      updates[`organizers/${user.uid}/enterpriseMember`] = true;
      updates[`organizers/${user.uid}/defaultOrganizationId`] = invite.organizationId;
      updates[`organizers/${user.uid}/updatedAt`] = now;

      updates[`organizationEmailInvites/${key}/status`] = 'accepted';
      updates[`organizationEmailInvites/${key}/acceptedBy`] = user.uid;
      updates[`organizationEmailInvites/${key}/acceptedAt`] = now;
      updates[`organizations/${invite.organizationId}/pendingInvites/${key}`] = null;

      await db.ref().update(updates);

      notify(`Accès au groupe ${invite.groupName || 'Entreprise'} activé.`);
      window.dispatchEvent(new CustomEvent('quizlive-enterprise-membership-ready', {
        detail: {
          organizationId: invite.organizationId,
          groupId: invite.groupId
        }
      }));

      return true;
    } catch (error) {
      console.error('Activation automatique de l’invitation Enterprise :', error);
      notify(error.message || 'Activation de l’accès impossible.', 'error');
      return false;
    } finally {
      accepting = false;
    }
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
    const ready = currentUser ? acceptInvite(currentUser) : Promise.resolve(false);
    window.QuizLiveEnterpriseReady = ready;
  });

  window.QuizLiveEnterpriseInvites = {
    emailKey,
    createInvite,
    acceptInvite
  };
})();