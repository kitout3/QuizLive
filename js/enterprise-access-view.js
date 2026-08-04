(() => {
  'use strict';

  const MAX_ACCOUNTS = 4;
  let currentUser = null;
  let running = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const normalizeEmail = value => String(value || '').trim().toLowerCase();

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
        if (!groupName) return;
        card.querySelector('.enterprise-pending-list')?.remove();

        const groupPending = pending.filter(invite => String(invite.groupName || '').trim().toLowerCase() === groupName.toLowerCase());
        if (!groupPending.length) return;

        const block = document.createElement('div');
        block.className = 'enterprise-pending-list';
        block.innerHTML = `<small style="display:block;margin:12px 0 6px;font-weight:700">Invitations en attente</small>${groupPending.map(invite => `<div class="dashboard-choice-row"><span><strong>${esc(invite.email)}</strong><small>Accès réservé · en attente de connexion</small></span><span class="dashboard-badge">En attente</span></div>`).join('')}`;
        card.appendChild(block);
      });

      removeObsoleteCards(content);
    } catch (error) {
      console.warn('Affichage des accès Enterprise impossible :', error);
    } finally {
      running = false;
    }
  }

  const observer = new MutationObserver(() => {
    setTimeout(refreshEnterpriseView, 0);
  });

  firebase.auth().onAuthStateChanged(user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    const content = document.getElementById('dashboardContent');
    if (content) observer.observe(content, { childList: true, subtree: true });
    refreshEnterpriseView();
  });

  window.addEventListener('quizlive-enterprise-invite-updated', () => {
    setTimeout(refreshEnterpriseView, 100);
  });
})();