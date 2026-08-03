// QuizLive - affichage/masquage des mots de passe
(() => {
  'use strict';

  const EYE_SHOW = '👁';
  const EYE_HIDE = '🙈';

  function enhancePasswordInput(input) {
    if (!(input instanceof HTMLInputElement) || input.dataset.passwordToggle === '1') return;
    if (input.type !== 'password') return;

    input.dataset.passwordToggle = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'password-field-wrapper';
    wrapper.style.cssText = 'position:relative;width:100%;';

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.style.paddingRight = '52px';
    input.style.width = '100%';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle-btn';
    button.setAttribute('aria-label', 'Afficher le mot de passe');
    button.setAttribute('aria-pressed', 'false');
    button.title = 'Afficher le mot de passe';
    button.textContent = EYE_SHOW;
    button.style.cssText = [
      'position:absolute',
      'right:10px',
      'top:50%',
      'transform:translateY(-50%)',
      'width:38px',
      'height:38px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'border:0',
      'border-radius:10px',
      'background:transparent',
      'color:inherit',
      'font-size:19px',
      'cursor:pointer',
      'z-index:2',
      '-webkit-tap-highlight-color:transparent'
    ].join(';');

    button.addEventListener('click', () => {
      const hidden = input.type === 'password';
      const start = input.selectionStart;
      const end = input.selectionEnd;

      input.type = hidden ? 'text' : 'password';
      button.textContent = hidden ? EYE_HIDE : EYE_SHOW;
      button.setAttribute('aria-pressed', String(hidden));
      button.setAttribute('aria-label', hidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      button.title = hidden ? 'Masquer le mot de passe' : 'Afficher le mot de passe';

      input.focus({ preventScroll: true });
      try {
        if (start !== null && end !== null) input.setSelectionRange(start, end);
      } catch (_) {}
    });

    wrapper.appendChild(button);
  }

  function enhanceAll(root = document) {
    root.querySelectorAll?.('input[type="password"]').forEach(enhancePasswordInput);
  }

  enhanceAll();

  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches?.('input[type="password"]')) enhancePasswordInput(node);
        enhanceAll(node);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
