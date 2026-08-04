(() => {
  'use strict';

  const db = window.QuizLiveFirebase?.organizerDatabase || database;
  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  const busy = new Set();
  let currentUser = null;

  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const emailKey = email => btoa(unescape(encodeURIComponent(normalizeEmail(email))))
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

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
    setTimeout(() => notice.remove(), 3500);
  }

  async function context() {
    if (!currentUser) throw new Error('Compte organisateur non connecté.');

    const [profileSnap, linksSnap] = await Promise.all([
      db.ref(`organizers/${currentUser.uid}`).once('value'),
      db.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);

    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';
    if (!organizationId) throw new Error('Organisation introuvable.');

    const [organizationSnap, membersSnap, groupsSnap] = await Promise.all([
      db.ref(`organizations/${organizationId}`).once('value'),
      db.ref(`organizationMembers/${organizationId}`).once('value'),
      db.ref(`organizationGroups/${organizationId}`).once('value')
    ]);

    const organization = organizationSnap.val() || {};
    if (organization.ownerUid !== currentUser.uid) {
      throw new Error('Action réservée au propriétaire.');
    }

    return {
      organizationId,
      organization,
      members: membersSnap.val() || {},
      groups: groupsSnap.val() || {}
    };
  }

  function updateCounter(selector, delta, minimum = 0) {
    const element = document.querySelector(selector);
    if (!element) return;
    const match = element.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;
    element.textContent = `${Math.max(minimum, Number(match[1]) + delta)}/${match[2]}`;
  }

  function optimisticRemove(element) {
    if (!element?.parentNode) return () => {};
    const parent = element.parentNode;
    const next = element.nextSibling;
    element.style.pointerEvents = 'none';
    element.style.opacity = '0';
    element.style.transform = 'scale(.98)';
    element.style.transition = 'opacity .14s ease, transform .14s ease';
    setTimeout(() => element.remove(), 140);

    return () => {
      element.style.opacity = '';
      element.style.transform = '';
      element.style.pointerEvents = '';
      if (!element.isConnected) parent.insertBefore(element, next);
    };
  }

  function synchronizeRemainingGroups(updates, ctx, uid, remaining) {
    const ids = Object.keys(remaining);
    updates[`organizationMembers/${ctx.organizationId}/${uid}/groupIds`] = remaining;
    updates[`userOrganizations/${uid}/${ctx.organizationId}/groupIds`] = remaining;

    const primaryId = ids[0];
    const primaryGroup = ctx.groups[primaryId] || {};
    updates[`userOrganizations/${uid}/${ctx.organizationId}/groupId`] = primaryId;
    updates[`userOrganizations/${uid}/${ctx.organizationId}/groupName`] = primaryGroup.name || 'Groupe';
  }

  async function deleteInvite(button) {
    const row = button.closest('.dashboard-choice-row');
    const email = normalizeEmail(row?.querySelector('strong')?.textContent || '');
    const key = button.dataset.deleteInvite || emailKey(email);
    if (!key) throw new Error('Invitation introuvable.');
    if (!confirm(`Supprimer l’invitation envoyée à ${email || 'cette adresse'} ?`)) return;

    const lock = `invite:${key}`;
    if (busy.has(lock)) return;
    busy.add(lock);
    button.disabled = true;

    const rollback = optimisticRemove(row);
    updateCounter('.enterprise-summary .dashboard-stat:first-child strong', -1, 1);

    try {
      const ctx = await context();
      await db.ref().update({
        [`organizations/${ctx.organizationId}/pendingInvites/${key}`]: null,
        [`organizationEmailInvites/${key}`]: null
      });
      notify('Invitation supprimée.');
      window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
    } catch (error) {
      rollback();
      updateCounter('.enterprise-summary .dashboard-stat:first-child strong', 1, 1);
      throw error;
    } finally {
      busy.delete(lock);
      button.disabled = false;
    }
  }

  async function removeMember(button) {
    const uid = button.dataset.removeMember;
    const row = button.closest('.dashboard-choice-row');
    const card = button.closest('.enterprise-group-card');
    const groupId = card?.querySelector('[data-delete-group]')?.dataset.deleteGroup || '';
    const groupName = card?.querySelector('h3')?.textContent?.trim() || 'ce groupe';

    if (!uid || !groupId) throw new Error('Membre ou groupe introuvable.');
    if (!confirm(`Retirer cette personne du groupe « ${groupName} » ?`)) return;

    const lock = `member:${groupId}:${uid}`;
    if (busy.has(lock)) return;
    busy.add(lock);
    button.disabled = true;
    const rollback = optimisticRemove(row);

    try {
      const ctx = await context();
      const member = ctx.members[uid];
      if (!member) throw new Error('Membre introuvable.');

      const remaining = { ...(member.groupIds || {}) };
      delete remaining[groupId];

      const updates = {
        [`organizationGroupMembers/${ctx.organizationId}/${groupId}/${uid}`]: null
      };

      if (Object.keys(remaining).length) {
        synchronizeRemainingGroups(updates, ctx, uid, remaining);
      } else {
        updates[`organizationMembers/${ctx.organizationId}/${uid}`] = null;
        updates[`userOrganizations/${uid}/${ctx.organizationId}`] = null;
        updateCounter('.enterprise-summary .dashboard-stat:first-child strong', -1, 1);
      }

      await db.ref().update(updates);
      notify('Accès supprimé et index synchronisés.');
      window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
    } catch (error) {
      rollback();
      throw error;
    } finally {
      busy.delete(lock);
      button.disabled = false;
    }
  }

  async function deleteGroup(button) {
    const groupId = button.dataset.deleteGroup;
    const card = button.closest('.enterprise-group-card');
    const groupName = card?.querySelector('h3')?.textContent?.trim() || 'Sans nom';

    if (!groupId) throw new Error('Groupe introuvable.');
    if (!confirm(`Supprimer définitivement le groupe « ${groupName} » ?\n\nLes accès, invitations et index de quiz associés seront supprimés.`)) return;

    const lock = `group:${groupId}`;
    if (busy.has(lock)) return;
    busy.add(lock);
    button.disabled = true;
    const rollback = optimisticRemove(card);
    updateCounter('.enterprise-summary .dashboard-stat:nth-child(2) strong', -1, 0);

    try {
      const ctx = await context();
      const updates = {
        [`organizationGroups/${ctx.organizationId}/${groupId}`]: null,
        [`organizationGroupMembers/${ctx.organizationId}/${groupId}`]: null,
        [`groupSessions/${ctx.organizationId}/${groupId}`]: null
      };

      for (const [uid, member] of Object.entries(ctx.members)) {
        if (uid === currentUser.uid || !member?.groupIds?.[groupId]) continue;
        const remaining = { ...(member.groupIds || {}) };
        delete remaining[groupId];

        if (Object.keys(remaining).length) {
          synchronizeRemainingGroups(updates, ctx, uid, remaining);
        } else {
          updates[`organizationMembers/${ctx.organizationId}/${uid}`] = null;
          updates[`userOrganizations/${uid}/${ctx.organizationId}`] = null;
        }
      }

      let removedInvites = 0;
      for (const invite of Object.values(ctx.organization.pendingInvites || {})) {
        if (invite?.groupId !== groupId) continue;
        const key = invite.emailKey || emailKey(invite.email);
        updates[`organizations/${ctx.organizationId}/pendingInvites/${key}`] = null;
        updates[`organizationEmailInvites/${key}`] = null;
        removedInvites += 1;
      }

      await db.ref().update(updates);
      if (removedInvites) {
        updateCounter('.enterprise-summary .dashboard-stat:first-child strong', -removedInvites, 1);
      }
      notify(`Groupe « ${groupName} » supprimé.`);
      window.dispatchEvent(new CustomEvent('quizlive-enterprise-invite-updated'));
    } catch (error) {
      rollback();
      updateCounter('.enterprise-summary .dashboard-stat:nth-child(2) strong', 1, 0);
      throw error;
    } finally {
      busy.delete(lock);
      button.disabled = false;
    }
  }

  document.addEventListener('click', async event => {
    const inviteButton = event.target.closest('[data-delete-invite]');
    const memberButton = event.target.closest('[data-remove-member]');
    const groupButton = event.target.closest('[data-delete-group]');
    const button = inviteButton || memberButton || groupButton;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      if (inviteButton) await deleteInvite(inviteButton);
      else if (memberButton) await removeMember(memberButton);
      else await deleteGroup(groupButton);
    } catch (error) {
      console.error('Gestion Enterprise :', error);
      notify(error.message || 'Action impossible.', 'error');
    }
  }, true);

  auth.onAuthStateChanged(user => {
    currentUser = user && !user.isAnonymous ? user : null;
  });
})();