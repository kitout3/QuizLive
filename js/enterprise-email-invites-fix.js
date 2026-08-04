(() => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  let currentUser = null;
  let accepting = false;

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const emailKey = email => btoa(unescape(encodeURIComponent(normalizeEmail(email))))
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  function notify(text, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    const content = document.getElementById('dashboardContent');
    if (!content) return;
    const notice = document.createElement('div');
    notice.className = `dashboard-notice ${type}`;
    notice.textContent = text;
    content.prepend(notice);
    setTimeout(() => notice.remove(), 4500);
  }

  async function ownerContext() {
    if (!currentUser) throw new Error('Compte organisateur non connecté.');
    const [profileSnap, linksSnap] = await Promise.all([
      database.ref(`organizers/${currentUser.uid}`).once('value'),
      database.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);
    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';
    if (!organizationId) throw new Error('Aucun espace entreprise sélectionné.');

    const [organizationSnap, membersSnap, groupsSnap] = await Promise.all([
      database.ref(`organizations/${organizationId}`).once('value'),
      database.ref(`organizationMembers/${organizationId}`).once('value'),
      database.ref(`organizationGroups/${organizationId}`).once('value')
    ]);
    const organization = organizationSnap.val() || {};
    if (organization.ownerUid !== currentUser.uid) throw new Error('Seul le propriétaire peut inviter un collaborateur.');
    return { organizationId, organization, members: membersSnap.val() || {}, groups: groupsSnap.val() || {} };
  }

  async function createInvite(groupName, rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse e-mail invalide.');

    const context = await ownerContext();
    const pending = context.organization.pendingInvites || {};
    const activeEmails = new Set(Object.values(context.members).map(member => normalizeEmail(member?.email)).filter(Boolean));
    const pendingEntries = Object.values(pending).filter(invite => invite?.status === 'pending' && !activeEmails.has(normalizeEmail(invite.email)));

    if (Object.keys(context.members).length + pendingEntries.length >= MAX_ACCOUNTS) {
      throw new Error(`La limite de ${MAX_ACCOUNTS} comptes, invitations incluses, est atteinte.`);
    }
    if (activeEmails.has(email)) throw new Error('Cette adresse appartient déjà à un membre de l’entreprise.');
    if (pendingEntries.some(invite => normalizeEmail(invite.email) === email)) {
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

    const queueId = database.ref('emailQueue').push().key;
    const joinUrl = `${location.origin}${location.pathname.replace(/dashboard\.html.*$/, '')}login.html?invite=${encodeURIComponent(key)}`;
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
    updates[`emailQueue/${queueId}`] = {
      type: 'enterprise_invitation',
      to: email,
      organizationId: context.organizationId,
      organizationName: context.organization.name || 'Entreprise',
      groupId,
      groupName: group.name || 'Groupe',
      inviteKey: key,
      joinUrl,
      requestedBy: currentUser.uid,
      status: 'pending',
      createdAt: now
    };

    await database.ref().update(updates);
    window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
    return { email, queueId };
  }

  async function acceptInvite(user) {
    if (!user?.email || accepting) return;
    accepting = true;
    try {
      const email = normalizeEmail(user.email);
      const key = emailKey(email);
      const inviteSnap = await database.ref(`organizationEmailInvites/${key}`).once('value');
      const invite = inviteSnap.val();
      if (!invite || invite.status !== 'pending' || normalizeEmail(invite.email) !== email) return;

      const [membersSnap, groupSnap] = await Promise.all([
        database.ref(`organizationMembers/${invite.organizationId}`).once('value'),
        database.ref(`organizationGroups/${invite.organizationId}/${invite.groupId}`).once('value')
      ]);
      const members = membersSnap.val() || {};
      if (!groupSnap.exists()) throw new Error('Le groupe associé n’existe plus.');
      if (!members[user.uid] && Object.keys(members).length >= MAX_ACCOUNTS) throw new Error('Cette entreprise a atteint sa limite de comptes.');

      const now = firebase.database.ServerValue.TIMESTAMP;
      const existing = members[user.uid] || {};
      const updates = {};
      updates[`organizationMembers/${invite.organizationId}/${user.uid}`] = {
        uid: user.uid,
        email,
        displayName: user.displayName || email,
        role: existing.role === 'owner' ? 'owner' : 'member',
        groupIds: { ...(existing.groupIds || {}), [invite.groupId]: true },
        joinedAt: existing.joinedAt || now
      };
      updates[`organizationGroupMembers/${invite.organizationId}/${invite.groupId}/${user.uid}`] = { uid: user.uid, role: 'member', joinedAt: now };
      updates[`userOrganizations/${user.uid}/${invite.organizationId}`] = {
        role: 'member', name: invite.organizationName, type: 'company', plan: 'enterprise', groupId: invite.groupId, groupName: invite.groupName
      };
      updates[`organizers/${user.uid}/plan`] = 'enterprise';
      updates[`organizers/${user.uid}/enterpriseMember`] = true;
      updates[`organizers/${user.uid}/defaultOrganizationId`] = invite.organizationId;
      updates[`organizers/${user.uid}/updatedAt`] = now;
      updates[`organizationEmailInvites/${key}/status`] = 'accepted';
      updates[`organizationEmailInvites/${key}/acceptedBy`] = user.uid;
      updates[`organizationEmailInvites/${key}/acceptedAt`] = now;
      await database.ref().update(updates);
      notify(`Accès au groupe ${invite.groupName || 'Entreprise'} activé.`);
    } catch (error) {
      console.error('Invitation Enterprise par e-mail :', error);
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
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const submittedEmail = normalizeEmail(input.value);
    try {
      await createInvite(groupName, submittedEmail);
      notify(`Invitation enregistrée et mise en file d’envoi pour ${submittedEmail}.`);
      input.value = '';
    } catch (error) {
      notify(error.message || 'Invitation impossible.', 'error');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }, true);

  firebase.auth().onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    await acceptInvite(user);
  });
})();