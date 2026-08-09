// QuizLive — force toutes les ouvertures de quiz vers le runtime admin v87.
(() => {
  'use strict';

  const VERSION = '87';

  function patchLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = link.getAttribute('href') || '';
    if (!href.includes('admin.html?code=')) return;

    try {
      const url = new URL(href, location.href);
      url.searchParams.set('v', VERSION);
      link.href = url.toString();
    } catch (_) {}
  }

  function patch(root = document) {
    if (root instanceof HTMLAnchorElement) patchLink(root);
    root.querySelectorAll?.('a[href*="admin.html?code="]').forEach(patchLink);

    root.querySelectorAll?.('a[href^="index.html?create=1"]').forEach(link => {
      try {
        const url = new URL(link.getAttribute('href'), location.href);
        url.searchParams.set('v', VERSION);
        link.href = url.toString();
      } catch (_) {}
    });
  }

  patch();

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) patch(node);
    }));
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.QuizLiveAdminLinks = { version: VERSION, patch };
})();
