(() => {
  'use strict';

  function rewriteEditorLinks(root = document) {
    root.querySelectorAll('a[href^="admin.html?code="]').forEach(link => {
      const code = new URL(link.href, location.href).searchParams.get('code');
      if (!code) return;
      const text = (link.textContent || '').toLowerCase();
      if (/ouvrir|éditeur|modifier/.test(text)) link.href = `editor.html?code=${encodeURIComponent(code)}`;
    });
    root.querySelectorAll('a[href="index.html?create=1"]').forEach(link => {
      link.href = 'editor.html';
    });
  }

  rewriteEditorLinks();
  new MutationObserver(() => rewriteEditorLinks()).observe(document.body, { childList: true, subtree: true });
})();