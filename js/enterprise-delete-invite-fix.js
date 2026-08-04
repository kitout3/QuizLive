(() => {
  'use strict';

  let currentUser = null;

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

  async function getOrganizationId() {
    if (!currentUser) throw new Error('Compte non connecté.');
    const [profileSnap, linksSnap] = await Promise.all([
      database.ref(`organizers/${currentUser.uid}`).once('value'),
      database.ref(`userOrganizations/${currentUser.uid}`).once('value')
    ]);
    const profile = profileSnap.val() || {};
    const links = linksSnap.val() || {};
    return profile.defaultOrganizationId || Object.keys(links)[0] || '';
  }

  async function deleteInvite(button) {
    const row = button.closest('.dashboard-choice-row');
    const email = normalizeEmail(row?.querySelector('strong')?.textContent || '');
    const key = button.dataset.deleteInvite || emailKey(email);
    if (!email || !key) throw new Error('Invitation introuvable.');
    if (!confirm(`Supprimer l’invitation envoyée à ${email} ?`)) return;

    const organizationId = await getOrganizationId();
    if (!organizationId) throw new Error('Organisation introuvable.');

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    const results = await Promise.allSettled([
      database.ref(`organizations/${organizationId}/pendingInvites/${key}`).remove(),
      database.ref(`organizationEmailInvites/${key}`).remove()
    ]);

    const succeeded = results.some(result => result.status === 'fulfilled');
    if (!succeeded) {
      const reason = results.find(result => result.status === 'rejected')?.reason;
      throw reason || new Error('Suppression refusée par Firebase.');
    }

    row?.remove();

    const counter = document.querySelector('.enterprise-summary .dashboard-stat strong');
    if (counter) {
      const match = counter.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (match) counter.textContent = `${Math.max(1, Number(match[1]) - 1)}/${match[2]}`;
    }

    notify('Invitation supprimée. Cette adresse peut être invitée de nouveau.');
    window.dispatchEvent(new Event('quizlive-enterprise-invite-updated'));
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-invite]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      await deleteInvite(button);
    } catch (error) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      notify(error?.message || 'Suppression impossible.', 'error');
    }
  }, true);

  firebase.auth().onAuthStateChanged(user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
  });
})();
