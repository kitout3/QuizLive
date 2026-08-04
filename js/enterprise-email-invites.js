(() => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  let currentUser = null;
  let processing = false;

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function emailKey(email) {
    const normalized = normalizeEmail(email);
    const encoded = btoa(unescape(encodeURIComponent(normalized)));
    return encoded.replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

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
    setTimeout(() => notice.remove(), 4500);
  }

  async function ownerContext() {
    const profileSnap = await database.ref(`organizers/${currentUser.uid}`).once('value');
    const profile = profileSnap.val() || {};
    const organizationsSnap = await database.ref(`userOrganizations/${currentUser.uid}`).once('value');
    const organizations = organizationsSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(organizations)[0] || '';
    if (!organizationId) throw new Error('Aucun espace entreprise sélectionné.');

    const [organizationSnap, membersSnap, groupsSnap] = await Promise.all([
      database.ref(`organizations/${organizationId}`).once('value'),
      database.ref(`organizationMembers/${organizationId}`).once('value'),
      database.ref(`organizationGroups/${organizationId}`).once('value')
    ]);

    const organization = organizationSnap.val() || {};
    if (organization.ownerUid !== currentUser.uid) throw new Error('Seul le propriétaire peut inviter un collaborateur.');

    return {
      organizationId,
      organization,
      members: membersSnap.val() || {},
      groups: groupsSnap.val() || {}
    };
  }

  async function inviteByEmail(groupId, email) {
    const normalized = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error('Adresse e-mail invalide.');
    }

    const context = await ownerContext();
    if (Object.keys(context.members).length >= MAX_ACCOUNTS) {
      throw new Error(`La limite de ${MAX_ACCOUNTS} comptes est atteinte.`);
    }

    const group = context.groups[groupId];
    if (!group) throw new Error('Groupe introuvable.');

    const duplicateMember = Object.values(context.members).find(member => normalizeEmail(member?.email) === normalized);
    if (duplicateMember) throw new Error('Cette adresse appartient déjà à un membre de l’entreprise.');

    const key = emailKey(normalized);
    const inviteId = `${context.organizationId}__${groupId}`;
    await database.ref(`organizationEmailInvites/${key}/${inviteId}`).set({
      id: inviteId,
      email: normalized,
      organizationId: context.organizationId,
      organizationName: context.organization.name || 'Entreprise',
      groupId,
      groupName: group.name || 'Groupe',
      plan: 'enterprise',
      invitedBy: currentUser.uid,
      status: 'pending',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  async function acceptEmailInvites(user) {
    if (!user?.email || processing) return;
    processing = true;
    try {
      const normalized = normalizeEmail(user.email);
      const key = emailKey(normalized);
      const snap = await database.ref(`organizationEmailInvites/${key}`).once('value');
      const invites = Object.entries(snap.val() || {});

      for (const [inviteId, invite] of invites) {
        if (!invite || invite.status !== 'pending' || normalizeEmail(invite.email) !== normalized) continue;

        const memberSnap = await database.ref(`organizationMembers/${invite.organizationId}`).once('value');
        const members = memberSnap.val() || {};
        if (!members[user.uid] && Object.keys(members).length >= MAX_ACCOUNTS) {
          console.warn('Invitation Enterprise ignorée : limite de comptes atteinte.');
          continue;
        }

        const now = firebase.database.ServerValue.TIMESTAMP;
        const existingMember = members[user.uid] || {};
        const groupIds = { ...(existingMember.groupIds || {}), [invite.groupId]: true };
        const updates = {};

        updates[`organizationMembers/${invite.organizationId}/${user.uid}`] = {
          uid: user.uid,
          email: normalized,
          displayName: user.displayName || normalized,
          role: existingMember.role === 'owner' ? 'owner' : 'member',
          groupIds,
          joinedAt: existingMember.joinedAt || now
        };
        updates[`organizationGroupMembers/${invite.organizationId}/${invite.groupId}/${user.uid}`] = {
          uid: user.uid,
          email: normalized,
          role: 'member',
          joinedAt: now
        };
        updates[`userOrganizations/${user.uid}/${invite.organizationId}`] = {
          role: 'member',
          name: invite.organizationName,
          type: 'company',
          plan: 'enterprise',
          groupId: invite.groupId,
          groupName: invite.groupName
        };
        updates[`organizers/${user.uid}/plan`] = 'enterprise';
        updates[`organizers/${user.uid}/enterpriseMember`] = true;
        updates[`organizers/${user.uid}/defaultOrganizationId`] = invite.organizationId;
        updates[`organizers/${user.uid}/updatedAt`] = now;
        updates[`organizationEmailInvites/${key}/${inviteId}/status`] = 'accepted';
        updates[`organizationEmailInvites/${key}/${inviteId}/acceptedBy`] = user.uid;
        updates[`organizationEmailInvites/${key}/${inviteId}/acceptedAt`] = now;

        await database.ref().update(updates);
      }
    } catch (error) {
      console.warn('Acceptation automatique de l’invitation Enterprise impossible :', error);
    } finally {
      processing = false;
    }
  }

  async function decorateGroupInviteButtons() {
    if (!currentUser) return;
    const buttons = document.querySelectorAll('[data-invite-group]:not([data-email-invite-ready])');
    buttons.forEach(button => {
      button.dataset.emailInviteReady = 'true';
      const groupId = button.dataset.inviteGroup;
      const form = document.createElement('form');
      form.className = 'enterprise-inline-form enterprise-email-invite-form';
      form.innerHTML = `
        <input type="email" maxlength="320" autocomplete="email" placeholder="Adresse e-mail du collaborateur" aria-label="Adresse e-mail du collaborateur" required>
        <button type="submit" class="btn-primary">Inviter</button>`;
      button.replaceWith(form);

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const input = form.querySelector('input');
        const submit = form.querySelector('button');
        submit.disabled = true;
        try {
          await inviteByEmail(groupId, input.value);
          notify(`Invitation enregistrée pour ${normalizeEmail(input.value)}.`);
          input.value = '';
        } catch (error) {
          notify(error.message || 'Invitation impossible.', 'error');
        } finally {
          submit.disabled = false;
        }
      });
    });
  }

  const observer = new MutationObserver(() => {
    decorateGroupInviteButtons().catch(error => console.warn(error));
  });

  firebase.auth().onAuthStateChanged(async user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    await acceptEmailInvites(user);
    const content = document.getElementById('dashboardContent');
    if (content) observer.observe(content, { childList: true, subtree: true });
    decorateGroupInviteButtons().catch(error => console.warn(error));
  });

  window.QuizEnterpriseEmailInvites = {
    emailKey,
    acceptEmailInvites
  };
})();