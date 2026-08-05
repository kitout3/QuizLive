(() => {
  'use strict';

  let observer = null;
  let started = false;

  function beautifyDeleteButton(button) {
    if (!(button instanceof HTMLButtonElement) || button.dataset.iconReady === 'true') {
      return;
    }

    const isGroup = button.hasAttribute('data-delete-group');
    const isInvite = button.hasAttribute('data-delete-invite');
    const label = isGroup
      ? 'Supprimer le groupe'
      : isInvite
        ? 'Supprimer cette invitation'
        : 'Retirer cette personne du groupe';

    button.dataset.iconReady = 'true';
    button.classList.remove('editor-danger', 'btn-primary');
    button.classList.add('enterprise-icon-delete');

    if (isGroup) {
      button.classList.add('enterprise-group-delete');
    }

    button.textContent = '×';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  function beautifyDeleteButtons(root = document) {
    if (root instanceof Element && root.matches('[data-delete-invite], [data-remove-member], [data-delete-group]')) {
      beautifyDeleteButton(root);
    }

    root.querySelectorAll?.('[data-delete-invite], [data-remove-member], [data-delete-group]')
      .forEach(beautifyDeleteButton);
  }

  function start() {
    if (started || !document.body) return;
    started = true;

    beautifyDeleteButtons(document);

    observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          beautifyDeleteButtons(node);
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  window.addEventListener('quizlive-enterprise-invite-updated', () => {
    requestAnimationFrame(() => beautifyDeleteButtons(document));
  });

  window.QuizLiveEnterpriseDeleteIcons = {
    version: '78',
    refresh: () => beautifyDeleteButtons(document)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
