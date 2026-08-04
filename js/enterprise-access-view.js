(() => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  let currentUser = null;
  let running = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
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
    setTimeout(() => notice.remove(), 4000);
  }

  async function organizationContext() {
    const [profileSnap, linksSnap] = await Promise.all([
      database.ref(`organizers/${currentUser.uid}`).once('value'),
      database.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);
    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    const organizationId = profile.defaultOrganizationId || Object.keys(links)[0] || '';
    if (!organizationId) return null;

    const [organizationSnap, membersSnap, groupsSnap] = await Promise.all([
      database.ref(`organizations/${organizationId}`).once('value'),
      database.ref(`organizationMembers/${organizationId}`).once('value'),
      database.ref(`organizationGroups/${organizationId}`).once('value')
    ]);

    return {
      organizationId,
      organization: organizationSnap.val() || {},
      members: Object.entries(membersSnap.val() || {}).map(([uid, value]) => ({ uid, ...value })),
      groups: Object.entries(groupsSnap.val() || {}).map(([id, value]) => ({ id, ...value }))
    };
  }

  function removeObsoleteCards(content) {
    content.querySelectorAll('.dashboard-card').forEach(card => {
      const heading = card.querySelector('h2')?.textContent?.trim();
      if (heading === 'Utilisateurs' || heading === 'Rejoindre avec un autre code') card.remove();
    });
  }

  async function deletePendingInvite(context, invite) {
    if (!confirm(`Supprimer l’invitation envoyée à ${invite.email} ?`)) return;
    const key = invite.emailKey || emailKey(invite.email);
    const updates = {};
    updates[`organizations/${context.organizationId}/pendingInvites/${key}`] = null;
    updates[`organizationEmailInvites/${key}`] = null;
    await database.ref().update(updates);
    notify('Invitation supprimée. Cette adresse peut être invitée de nouveau.');
    window.dispatchEvent(new Event('quizlive-enterprise-invite-updated'));
  }

  async function removeMemberAccess(context, member, groupId, groupName) {
    if (!confirm(`Retirer ${member.email || member.displayName || 'ce membre'} du groupe ${groupName} ?`)) return;
    const remaining = { ...(member.groupIds || {}) };
    delete remaining[groupId];
    const updates = {};
    updates[`organizationGroupMembers/${context.organizationId}/${groupId}/${member.uid}`] = null;

    if (Object.keys(remaining).length) {
      updates[`organizationMembers/${context.organizationId}/${member.uid}/groupIds`] = remaining;
    } else {
      updates[`organizationMembers/${context.organizationId}/${member.uid}`] = null;
      updates[`userOrganizations/${member.uid}/${context.organizationId}`] = null;
    }

    const key = member.email ? emailKey(member.email) : '';
    if (key) {
      updates[`organizations/${context.organizationId}/pendingInvites/${key}`] = null;
      updates[`organizationEmailInvites/${key}`] = null;
    }

    await database.ref().update(updates);
    notify('Accès supprimé. Cette personne peut être invitée de nouveau.');
    window.dispatchEvent(new Event('quizlive-enterprise-invite-updated'));
  }

  async function deleteGroup(context, group) {
    const linkedMembers = context.members.filter(member => member.uid !== currentUser.uid && member.groupIds?.[group.id]);
    const pending = Object.values(context.organization.pendingInvites || {})
      .filter(invite => invite?.groupId === group.id);
    const warning = `Supprimer définitivement le groupe « ${group.name} » ?\n\n${linkedMembers.length} membre(s) et ${pending.length} invitation(s) seront détachés de ce groupe.`;
    if (!confirm(warning)) return;

    const updates = {};
    updates[`organizationGroups/${context.organizationId}/${group.id}`] = null;
    updates[`organizationGroupMembers/${context.organizationId}/${group.id}`] = null;

    for (const member of linkedMembers) {
      const remaining = { ...(member.groupIds || {}) };
      delete remaining[group.id];
      if (Object.keys(remaining).length) {
        updates[`organizationMembers/${context.organizationId}/${member.uid}/groupIds`] = remaining;
      } else {
        updates[`organizationMembers/${context.organizationId}/${member.uid}`] = null;
        updates[`userOrganizations/${member.uid}/${context.organizationId}`] = null;
      }
    }

    for (const invite of pending) {
      const key = invite.emailKey || emailKey(invite.email);
      updates[`organizations/${context.organizationId}/pendingInvites/${key}`] = null;
      updates[`organizationEmailInvites/${key}`] = null;
    }

    await database.ref().update(updates);
    notify('Groupe supprimé.');
    setTimeout(() => location.reload(), 300);
  }

  async function refreshEnterpriseView() {
    if (!currentUser || running) return;
    const content = document.getElementById('dashboardContent');
    if (!content || !document.querySelector('.enterprise-summary')) return;

    running = true;
    try {
      const context = await organizationContext();
      if (!context) return;
      const isOwner = context.organization.ownerUid === currentUser.uid;
      if (!isOwner) {
        removeObsoleteCards(content);
        return;
      }

      const activeEmails = new Set(context.members.map(member => normalizeEmail(member.email)).filter(Boolean));
      const pending = Object.values(context.organization.pendingInvites || {})
        .filter(invite => invite?.status === 'pending' && !activeEmails.has(normalizeEmail(invite.email)));
      const usedAccounts = Math.min(MAX_ACCOUNTS, context.members.length + pending.length);

      const firstStat = content.querySelector('.enterprise-summary .dashboard-stat strong');
      if (firstStat) firstStat.textContent = `${usedAccounts}/${MAX_ACCOUNTS}`;
      const firstLabel = content.querySelector('.enterprise-summary .dashboard-stat span');
      if (firstLabel) firstLabel.textContent = 'Comptes et invitations';

      content.querySelectorAll('.enterprise-group-card').forEach(card => {
        const groupName = card.querySelector('h3')?.textContent?.trim() || '';
        const group = context.groups.find(item => item.name === groupName);
        if (!group) return;

        card.querySelector('.enterprise-access-management')?.remove();
        const groupPending = pending.filter(invite => invite.groupId === group.id || normalizeEmail(invite.groupName) === normalizeEmail(group.name));
        const groupMembers = context.members.filter(member => member.uid !== currentUser.uid && member.groupIds?.[group.id]);

        const block = document.createElement('div');
        block.className = 'enterprise-access-management';
        block.innerHTML = `
          ${groupMembers.length ? `<small style="display:block;margin:14px 0 6px;font-weight:700">Membres actifs</small>${groupMembers.map(member => `<div class="dashboard-choice-row"><span><strong>${esc(member.email || member.displayName || member.uid)}</strong><small>Accès actif</small></span><button type="button" class="editor-danger" data-remove-member="${esc(member.uid)}">Supprimer</button></div>`).join('')}` : ''}
          ${groupPending.length ? `<small style="display:block;margin:14px 0 6px;font-weight:700">Invitations en attente</small>${groupPending.map(invite => `<div class="dashboard-choice-row"><span><strong>${esc(invite.email)}</strong><small>En attente de connexion</small></span><button type="button" class="editor-danger" data-delete-invite="${esc(invite.emailKey || emailKey(invite.email))}">Supprimer</button></div>`).join('')}` : ''}
          <button type="button" class="editor-danger" data-delete-group="${esc(group.id)}" style="margin-top:16px">Supprimer le groupe</button>`;
        card.appendChild(block);

        block.querySelectorAll('[data-delete-invite]').forEach(button => {
          button.onclick = async () => {
            const invite = groupPending.find(item => (item.emailKey || emailKey(item.email)) === button.dataset.deleteInvite);
            if (invite) await deletePendingInvite(context, invite);
          };
        });
        block.querySelectorAll('[data-remove-member]').forEach(button => {
          button.onclick = async () => {
            const member = groupMembers.find(item => item.uid === button.dataset.removeMember);
            if (member) await removeMemberAccess(context, member, group.id, group.name);
          };
        });
        block.querySelector('[data-delete-group]').onclick = () => deleteGroup(context, group);
      });

      removeObsoleteCards(content);
    } catch (error) {
      console.warn('Gestion des accès Enterprise impossible :', error);
      notify(error.message || 'Action impossible.', 'error');
    } finally {
      running = false;
    }
  }

  const observer = new MutationObserver(() => setTimeout(refreshEnterpriseView, 0));

  firebase.auth().onAuthStateChanged(user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    const content = document.getElementById('dashboardContent');
    if (content) observer.observe(content, { childList: true, subtree: true });
    refreshEnterpriseView();
  });

  window.addEventListener('quizlive-enterprise-invite-updated', () => setTimeout(refreshEnterpriseView, 100));
})();