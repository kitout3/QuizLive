(() => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const emailKey = email => btoa(unescape(encodeURIComponent(normalizeEmail(email))))
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  let currentUser = null;
  let accepting = false;
  const initialSection = new URLSearchParams(location.search).get('section');
  const shouldOpenOrganization = initialSection === 'organization';

  // Empêche les autres modules de charger l'organisation avant l'acceptation.
  if (shouldOpenOrganization) {
    const safeUrl = new URL(location.href);
    safeUrl.searchParams.set('section', 'overview');
    history.replaceState({}, '', safeUrl);
  }

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
    const pendingEntries = Object.values(pending)
      .filter(invite => invite?.status === 'pending' && !activeEmails.has(normalizeEmail(invite.email)));

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
    await database.ref().update(updates);
    window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
    return { email };
  }

  async function acceptInvite(user) {
    if (!user?.email || accepting) return false;
    accepting = true;
    try {
      const email = normalizeEmail(user.email);
      const key = emailKey(email);
      const inviteSnap = await database.ref(`organizationEmailInvites/${key}`).once('value');
      const invite = inviteSnap.val();

      if (!invite || invite.status !== 'pending' || normalizeEmail(invite.email) !== email) {
        return false;
      }

      // Aucune lecture préalable de l'organisation, des membres ou du groupe :
      // l'utilisateur n'a pas encore les droits à ce stade.
      const now = firebase.database.ServerValue.TIMESTAMP;
      const updates = {};
      updates[`organizationMembers/${invite.organizationId}/${user.uid}`] = {
        uid: user.uid,
        email,
        displayName: user.displayName || email,
        role: 'member',
        groupIds: { [invite.groupId]: true },
        joinedAt: now
      };
      updates[`organizationGroupMembers/${invite.organizationId}/${invite.groupId}/${user.uid}`] = {
        uid: user.uid,
        role: 'member',
        joinedAt: now
      };
      updates[`userOrganizations/${user.uid}/${invite.organizationId}`] = {
        role: 'member',
        name: invite.organizationName || 'Entreprise',
        type: 'company',
        plan: 'enterprise',
        groupId: invite.groupId,
        groupName: invite.groupName || 'Groupe'
      };
      updates[`organizers/${user.uid}/plan`] = 'enterprise';
      updates[`organizers/${user.uid}/enterpriseMember`] = true;
      updates[`organizers/${user.uid}/defaultOrganizationId`] = invite.organizationId;
      updates[`organizers/${user.uid}/updatedAt`] = now;
      updates[`organizationEmailInvites/${key}/status`] = 'accepted';
      updates[`organizationEmailInvites/${key}/acceptedBy`] = user.uid;
      updates[`organizationEmailInvites/${key}/acceptedAt`] = now;
      updates[`organizations/${invite.organizationId}/pendingInvites/${key}`] = null;

      await database.ref().update(updates);
      notify(`Accès au groupe ${invite.groupName || 'Entreprise'} activé.`);
      window.dispatchEvent(new CustomEvent('quizlive-enterprise-membership-ready', {
        detail: { organizationId: invite.organizationId, groupId: invite.groupId }
      }));
      return true;
    } catch (error) {
      console.error('Activation automatique de l’invitation Enterprise :', error);
      notify(error?.message || 'Activation de l’accès impossible.', 'error');
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

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    try {
      await createInvite(groupName, submittedEmail);
      notify(`${submittedEmail} est en attente de sa première connexion.`);
      if (input) input.value = '';
    } catch (error) {
      notify(error?.message || 'Invitation impossible.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    }
  }, true);

  window.QuizLiveEnterpriseReady = new Promise(resolve => {
    firebase.auth().onAuthStateChanged(async user => {
      if (!user || user.isAnonymous) {
        resolve(false);
        return;
      }
      currentUser = user;
      const accepted = await acceptInvite(user);
      resolve(accepted);

      if (shouldOpenOrganization) {
        const targetUrl = new URL(location.href);
        targetUrl.searchParams.set('section', 'organization');
        history.replaceState({}, '', targetUrl);
        setTimeout(() => {
          document.querySelector('[data-section="organization"]')?.click();
        }, 50);
      }
    });
  });
})();