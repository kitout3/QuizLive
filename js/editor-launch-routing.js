(() => {
  'use strict';
  if (document.body?.dataset?.page !== 'editor') return;
  const button = document.getElementById('openLiveBtn');
  if (!button) return;

  function refresh() {
    const code = new URLSearchParams(location.search).get('code');
    if (!code) {
      button.href = '#';
      button.classList.add('disabled');
      return;
    }
    button.href = `launch.html?code=${encodeURIComponent(code)}`;
    button.classList.remove('disabled');
    button.textContent = 'Préparer le lancement';
  }

  const observer = new MutationObserver(refresh);
  observer.observe(button, { attributes:true, childList:true, subtree:true });
  window.addEventListener('popstate', refresh);
  setInterval(refresh, 800);
  refresh();
})();