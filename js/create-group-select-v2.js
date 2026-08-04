(() => {
  'use strict';

  const STYLE_ID = 'quizlive-group-select-v2-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #createModal #quizGroupField {
        width: 100% !important;
        margin: 0 0 20px !important;
      }

      #createModal #quizGroupField label {
        display: block !important;
        margin: 0 0 7px !important;
        color: rgba(255,255,255,.72) !important;
        font: 600 .85rem Outfit, sans-serif !important;
      }

      #createModal #quizGroupId.quizlive-group-select {
        box-sizing: border-box !important;
        display: block !important;
        width: 100% !important;
        height: 52px !important;
        min-height: 52px !important;
        margin: 0 !important;
        padding: 0 50px 0 17px !important;
        border: 1px solid rgba(255,255,255,.14) !important;
        border-radius: 16px !important;
        outline: none !important;
        background-color: #20213f !important;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23c4b5fd' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
        background-repeat: no-repeat !important;
        background-position: right 17px center !important;
        background-size: 19px 19px !important;
        color: #fff !important;
        -webkit-text-fill-color: #fff !important;
        font: 500 1rem Outfit, sans-serif !important;
        line-height: 52px !important;
        cursor: pointer !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        -moz-appearance: none !important;
        box-shadow: none !important;
        transition: border-color .18s ease, box-shadow .18s ease, background-color .18s ease !important;
      }

      #createModal #quizGroupId.quizlive-group-select:hover {
        border-color: rgba(168,85,247,.68) !important;
        background-color: #252649 !important;
      }

      #createModal #quizGroupId.quizlive-group-select:focus,
      #createModal #quizGroupId.quizlive-group-select:focus-visible {
        border-color: #8b5cf6 !important;
        background-color: #252649 !important;
        box-shadow: 0 0 0 3px rgba(139,92,246,.22) !important;
      }

      #createModal #quizGroupId.quizlive-group-select option {
        background: #20213f !important;
        color: #fff !important;
        font: 500 .95rem Outfit, sans-serif !important;
      }

      #createModal #quizGroupField small {
        display: block !important;
        margin-top: 8px !important;
        color: rgba(255,255,255,.48) !important;
        font-size: .78rem !important;
        line-height: 1.45 !important;
      }
    `;

    document.head.appendChild(style);
  }

  function styleSelector() {
    const field = document.getElementById('quizGroupField');
    const select = document.getElementById('quizGroupId');
    if (!field || !select) return false;

    injectStyle();
    select.classList.add('quizlive-group-select');

    const important = (property, value) => {
      select.style.setProperty(property, value, 'important');
    };

    important('display', 'block');
    important('width', '100%');
    important('height', '52px');
    important('min-height', '52px');
    important('padding', '0 50px 0 17px');
    important('border', '1px solid rgba(255,255,255,.14)');
    important('border-radius', '16px');
    important('background-color', '#20213f');
    important('color', '#ffffff');
    important('font-family', 'Outfit, sans-serif');
    important('font-size', '1rem');
    important('font-weight', '500');
    important('appearance', 'none');
    important('-webkit-appearance', 'none');
    important('-moz-appearance', 'none');
    important('cursor', 'pointer');

    return true;
  }

  injectStyle();
  styleSelector();

  const observer = new MutationObserver(() => {
    styleSelector();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener('load', styleSelector);
  window.addEventListener('quizlive-enterprise-membership-ready', styleSelector);
})();
