(() => {
  'use strict';

  function restoreLegacyLinks(root = document) {
    root.querySelectorAll('a[href^="editor.html?code="]').forEach(link => {
      const code = new URL(link.href, location.href).searchParams.get('code');
      if (code) link.href = `admin.html?code=${encodeURIComponent(code)}`;
    });
    root.querySelectorAll('a[href="editor.html"], a[href="index.html?create=1"]').forEach(link => {
      link.href = 'index.html?create=1';
    });
  }

  restoreLegacyLinks();
  new MutationObserver(() => restoreLegacyLinks()).observe(document.body, { childList: true, subtree: true });
})();
