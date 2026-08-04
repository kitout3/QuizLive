(() => {
  'use strict';

  function beautifyDeleteButtons(root = document) {
    root.querySelectorAll('[data-delete-invite], [data-remove-member], [data-delete-group]').forEach(button => {
      if (button.dataset.iconReady === 'true') return;
      const isGroup = button.hasAttribute('data-delete-group');
      const label = isGroup ? 'Supprimer le groupe' : button.hasAttribute('data-delete-invite') ? 'Supprimer cette invitation' : 'Retirer cette personne du groupe';

      button.dataset.iconReady = 'true';
      button.classList.remove('editor-danger');
      button.classList.add('enterprise-icon-delete');
      if (isGroup) button.classList.add('enterprise-group-delete');
      button.textContent = '×';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    });
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        beautifyDeleteButtons(node.matches?.('[data-delete-invite], [data-remove-member], [data-delete-group]') ? node.parentElement || node : node);
      });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    beautifyDeleteButtons();
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.addEventListener('quizlive-enterprise-invite-updated', () => {
    setTimeout(() => beautifyDeleteButtons(), 0);
  });
})();