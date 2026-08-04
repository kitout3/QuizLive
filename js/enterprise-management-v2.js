(() => {
  'use strict';

  let currentUser = null;
  const busy = new Set();

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
    setTimeout(() => notice.remove(), 3500);
  }

  async function context() {
    if (!currentUser) throw new Error('Compte organisateur non connecté.');
    const [profileSnap, linksSnap] = await Promise.all([
      database.ref(`organizers/${currentUser.uid}`).once('value'),
      database.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);
    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';
    if (!organizationId) throw new Error('Organisation introuvable.');

    const [organizationSnap, membersSnap, groupsSnap] = await Promise.all([
      database.ref(`organizations/${organizationId}`).once('value'),
      database.ref(`organizationMembers/${organizationId}`).once('value'),
      database.ref(`organizationGroups/${organizationId}`).once('value')
    ]);
    const organization = organizationSnap.val() || {};
    if (organization.ownerUid !== currentUser.uid) throw new Error('Action réservée au propriétaire.');
    return {
      organizationId,
      organization,
      members: membersSnap.val() || {},
      groups: groupsSnap.val() || {}
    };
  }

  function updateCounter(selector, delta, minimum = 0) {
    const el = document.querySelector(selector);
    if (!el) return;
    const match = el.textContent.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;
    el.textContent = `${Math.max(minimum, Number(match[1]) + delta)}/${match[2]}`;
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
      const updates = {
        [`organizations/${ctx.organizationId}/pendingInvites/${key}`]: null,
        [`organizationEmailInvites/${key}`]: null
      };
      await database.ref().update(updates);
      notify('Invitation supprimée. L’adresse peut être réinvitée immédiatement.');
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
        updates[`organizationMembers/${ctx.organizationId}/${uid}/groupIds`] = remaining;
      } else {
        updates[`organizationMembers/${ctx.organizationId}/${uid}`] = null;
        updates[`userOrganizations/${uid}/${ctx.organizationId}`] = null;
        updateCounter('.enterprise-summary .dashboard-stat:first-child strong', -1, 1);
      }
      await database.ref().update(updates);
      notify('Accès supprimé instantanément.');
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
    if (!confirm(`Supprimer définitivement le groupe « ${groupName} » ?\n\nLes invitations et accès associés seront également supprimés.`)) return;

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
        [`organizationGroupMembers/${ctx.organizationId}/${groupId}`]: null
      };

      for (const [uid, member] of Object.entries(ctx.members)) {
        if (uid === currentUser.uid || !member?.groupIds?.[groupId]) continue;
        const remaining = { ...(member.groupIds || {}) };
        delete remaining[groupId];
        if (Object.keys(remaining).length) {
          updates[`organizationMembers/${ctx.organizationId}/${uid}/groupIds`] = remaining;
        } else {
          updates[`organizationMembers/${ctx.organizationId}/${uid}`] = null;
          updates[`userOrganizations/${uid}/${ctx.organizationId}`] = null;
        }
      }

      let removedAccounts = 0;
      for (const invite of Object.values(ctx.organization.pendingInvites || {})) {
        if (invite?.groupId !== groupId) continue;
        const key = invite.emailKey || emailKey(invite.email);
        updates[`organizations/${ctx.organizationId}/pendingInvites/${key}`] = null;
        updates[`organizationEmailInvites/${key}`] = null;
        removedAccounts += 1;
      }

      await database.ref().update(updates);
      if (removedAccounts) updateCounter('.enterprise-summary .dashboard-stat:first-child strong', -removedAccounts, 1);
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
      console.error('Suppression Enterprise :', error);
      notify(error?.message || 'Suppression impossible.', 'error');
    }
  }, true);

  firebase.auth().onAuthStateChanged(user => {
    currentUser = user && !user.isAnonymous ? user : null;
  });
})();
