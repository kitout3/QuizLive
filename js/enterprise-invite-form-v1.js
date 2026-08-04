(() => {
  'use strict';

  function decorateInviteButtons() {
    document.querySelectorAll('[data-invite-group]:not([data-email-ready])').forEach(button => {
      const groupId = button.dataset.inviteGroup || '';
      button.dataset.emailReady = 'true';

      const form = document.createElement('form');
      form.className = 'enterprise-inline-form enterprise-email-invite-form';
      form.dataset.groupId = groupId;
      form.innerHTML = `
        <input
          type="email"
          maxlength="320"
          autocomplete="email"
          placeholder="Adresse e-mail du collaborateur"
          required>
        <button type="submit" class="btn-primary">Inviter</button>`;

      button.replaceWith(form);
    });
  }

  const content = document.getElementById('dashboardContent');
  if (content) {
    new MutationObserver(decorateInviteButtons).observe(content, {
      childList: true,
      subtree: true
    });
  }

  document.addEventListener('DOMContentLoaded', decorateInviteButtons);
  window.addEventListener('quizlive-enterprise-invite-updated', decorateInviteButtons);
  decorateInviteButtons();
})();