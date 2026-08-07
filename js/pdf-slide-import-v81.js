// QuizLive — import PDF : chaque page devient une slide.
(() => {
  'use strict';

  const VERSION = '81';
  const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MAX_PAGES = 40;
  const MAX_RENDER_DIMENSION = 1500;
  const JPEG_QUALITY = 0.82;

  let pdfJsPromise = null;

  function isEnglish() {
    const lang = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(lang).toLowerCase().startsWith('en');
  }

  function text(fr, en) {
    return isEnglish() ? en : fr;
  }

  function ensurePdfJs() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return Promise.resolve(window.pdfjsLib);
    }

    if (pdfJsPromise) return pdfJsPromise;

    pdfJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${PDFJS_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => {
          if (!window.pdfjsLib) {
            reject(new Error('PDF.js indisponible.'));
            return;
          }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
          resolve(window.pdfjsLib);
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('Impossible de charger PDF.js.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = PDFJS_SRC;
      script.async = true;
      script.dataset.quizlivePdfJs = VERSION;
      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error('PDF.js indisponible.'));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('Impossible de charger PDF.js.'));
      document.head.appendChild(script);
    });

    return pdfJsPromise;
  }

  function updateImportUi() {
    const modal = document.getElementById('importSlidesModal');
    if (!modal) return;

    const title = modal.querySelector('h2');
    if (title) {
      title.textContent = text('📄 Importer un PDF', '📄 Import a PDF');
    }

    const instruction = modal.querySelector('.import-instructions');
    if (instruction) {
      instruction.innerHTML = `
        <p style="color:var(--text-secondary);margin-bottom:12px">
          ${text(
            'Importez directement votre présentation au format PDF. Chaque page du PDF sera automatiquement transformée en une slide.',
            'Import your presentation directly as a PDF. Each PDF page will automatically become a slide.'
          )}
        </p>
        <p style="color:var(--text-muted);font-size:.85rem;line-height:1.55">
          ${text(
            `💡 Une page = une slide. Maximum ${MAX_PAGES} pages par import. Les pages sont optimisées automatiquement pour l’affichage.`,
            `💡 One page = one slide. Maximum ${MAX_PAGES} pages per import. Pages are automatically optimized for display.`
          )}
        </p>`;
    }

    const input = document.getElementById('slidesFileInput');
    if (input) {
      input.accept = 'application/pdf,.pdf';
      input.removeAttribute('multiple');
      input.setAttribute('aria-label', text('Sélectionner un fichier PDF', 'Select a PDF file'));
    }

    const label = modal.querySelector('label[for="slidesFileInput"]');
    if (label) {
      label.textContent = text('📄 Choisir un fichier PDF', '📄 Choose a PDF file');
    }

    const button = document.getElementById('importSlidesBtn');
    if (button && !button.disabled) {
      button.textContent = text('Sélectionner le PDF', 'Select PDF');
    }

    const sidebarButton = document.querySelector('button[onclick="showImportSlidesModal()"]');
    if (sidebarButton) {
      sidebarButton.textContent = text('📄 Importer PDF', '📄 Import PDF');
      sidebarButton.setAttribute('title', text(
        'Importer un PDF, une page par slide',
        'Import a PDF, one page per slide'
      ));
    }
  }

  function showImportPdfModal() {
    updateImportUi();
    const modal = document.getElementById('importSlidesModal');
    if (modal) modal.classList.add('active');
  }

  function fileBaseName(fileName) {
    return String(fileName || 'PDF')
      .replace(/\.pdf$/i, '')
      .trim()
      .slice(0, 100) || 'PDF';
  }

  function pageScale(page) {
    const viewport = page.getViewport({ scale: 1 });
    const largest = Math.max(viewport.width, viewport.height);
    if (!largest) return 1;
    return Math.min(2, MAX_RENDER_DIMENSION / largest);
  }

  async function renderPageAsSlide(pdf, pageNumber, baseName) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: pageScale(page) });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });

    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    context.save();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();

    await page.render({
      canvasContext: context,
      viewport,
      background: 'rgb(255,255,255)'
    }).promise;

    const imageData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    page.cleanup?.();

    return {
      type: 'slide',
      name: `${baseName} — ${text('page', 'page')} ${pageNumber}`,
      imageData,
      sourceType: 'pdf',
      sourcePage: pageNumber,
      createdAt: Date.now() + pageNumber
    };
  }

  async function handlePdfImport(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    const button = document.getElementById('importSlidesBtn');
    const resetButton = () => {
      if (button) {
        button.disabled = false;
        button.textContent = text('Sélectionner le PDF', 'Select PDF');
      }
    };

    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      window.showToast?.(text('Sélectionnez un fichier PDF.', 'Select a PDF file.'), 'error');
      input.value = '';
      resetButton();
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = text('⏳ Lecture du PDF…', '⏳ Reading PDF…');
    }

    try {
      if (typeof currentSession === 'undefined' || !currentSession?.code) {
        throw new Error(text('Session introuvable.', 'Session not found.'));
      }

      const pdfjs = await ensurePdfJs();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loadingTask = pdfjs.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;

      if (!pdf.numPages) {
        throw new Error(text('Le PDF ne contient aucune page.', 'The PDF has no pages.'));
      }

      if (pdf.numPages > MAX_PAGES) {
        throw new Error(text(
          `Ce PDF contient ${pdf.numPages} pages. La limite est de ${MAX_PAGES} pages par import.`,
          `This PDF contains ${pdf.numPages} pages. The limit is ${MAX_PAGES} pages per import.`
        ));
      }

      const baseName = fileBaseName(file.name);
      const slides = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (button) {
          button.textContent = text(
            `⏳ Import ${pageNumber}/${pdf.numPages}`,
            `⏳ Import ${pageNumber}/${pdf.numPages}`
          );
        }
        slides.push(await renderPageAsSlide(pdf, pageNumber, baseName));
      }

      await pdf.destroy?.();

      const existingQuestions = Array.isArray(currentSession.questions)
        ? currentSession.questions
        : [];
      const allItems = [...existingQuestions, ...slides];

      await database.ref(`sessions/${currentSession.code}/questions`).set(allItems);

      window.showToast?.(text(
        `${slides.length} page(s) PDF importée(s) comme slide(s) !`,
        `${slides.length} PDF page(s) imported as slide(s)!`
      ));

      if (typeof window.closeModals === 'function') window.closeModals();
      input.value = '';
    } catch (error) {
      console.error('Import PDF QuizLive :', error);

      let message = error?.message || text('Import PDF impossible.', 'Unable to import PDF.');
      if (error?.name === 'PasswordException') {
        message = text(
          'Ce PDF est protégé par un mot de passe. Retirez la protection avant de l’importer.',
          'This PDF is password protected. Remove the protection before importing it.'
        );
      }

      window.showToast?.(message, 'error');
    } finally {
      resetButton();
    }
  }

  function install() {
    updateImportUi();

    // Remplace les anciennes fonctions définies dans app.js.
    window.showImportSlidesModal = showImportPdfModal;
    window.handleSlidesImport = handlePdfImport;

    document.addEventListener('quizlive:languagechange', updateImportUi);
    window.addEventListener('quizlive-language-change', updateImportUi);

    const contentObserver = new MutationObserver(() => updateImportUi());
    contentObserver.observe(document.body, { childList: true, subtree: true });
  }

  window.QuizLivePdfSlideImport = {
    version: VERSION,
    open: showImportPdfModal,
    import: handlePdfImport
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
