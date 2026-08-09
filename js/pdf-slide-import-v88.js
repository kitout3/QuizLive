// QuizLive — import PDF isolé : 1 page PDF = 1 slide.
(() => {
  'use strict';

  const VERSION = '88';
  const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MAX_PAGES = 40;
  const MAX_DIMENSION = 1280;
  const TARGET_BYTES = 150 * 1024;
  let pdfJsPromise = null;

  const tr = (fr, en) => {
    const lang = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(lang).toLowerCase().startsWith('en') ? en : fr;
  };

  function approxBytes(dataUrl) {
    const payload = String(dataUrl || '').split(',')[1] || '';
    return Math.ceil(payload.length * 0.75);
  }

  function loadPdfJs() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return Promise.resolve(window.pdfjsLib);
    }
    if (pdfJsPromise) return pdfJsPromise;

    pdfJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_SRC;
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error(tr('PDF.js est indisponible.', 'PDF.js is unavailable.')));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error(tr('Impossible de charger le lecteur PDF.', 'Unable to load the PDF reader.')));
      document.head.appendChild(script);
    });

    return pdfJsPromise;
  }

  function fileNameWithoutExtension(name) {
    return String(name || 'Présentation').replace(/\.pdf$/i, '').trim().slice(0, 100) || 'Présentation';
  }

  async function renderPage(pdf, pageNumber, baseName) {
    const page = await pdf.getPage(pageNumber);
    const rawViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_DIMENSION / Math.max(rawViewport.width || 1, rawViewport.height || 1));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' }).promise;

    let quality = 0.78;
    let imageData = canvas.toDataURL('image/jpeg', quality);
    while (approxBytes(imageData) > TARGET_BYTES && quality > 0.38) {
      quality -= 0.07;
      imageData = canvas.toDataURL('image/jpeg', quality);
    }

    page.cleanup?.();
    return {
      type: 'slide',
      name: `${baseName} — page ${pageNumber}`,
      imageData,
      sourceType: 'pdf',
      sourcePage: pageNumber,
      createdAt: Date.now() + pageNumber
    };
  }

  function resetButton() {
    const button = document.getElementById('importSlidesBtn');
    if (button) {
      button.disabled = false;
      button.textContent = tr('Sélectionner le PDF', 'Select PDF');
    }
  }

  async function handlePdfImport(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) return;

    const button = document.getElementById('importSlidesBtn');
    if (button) {
      button.disabled = true;
      button.textContent = tr('⏳ Lecture du PDF…', '⏳ Reading PDF…');
    }

    try {
      if (!currentSession?.code) throw new Error(tr('Quiz non chargé.', 'Quiz not loaded.'));
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
        throw new Error(tr('Sélectionnez un fichier PDF.', 'Select a PDF file.'));
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error(tr('Le PDF dépasse 25 Mo.', 'The PDF exceeds 25 MB.'));
      }

      const pdfjs = await loadPdfJs();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;

      if (!pdf.numPages) throw new Error(tr('Le PDF ne contient aucune page.', 'The PDF contains no pages.'));
      if (pdf.numPages > MAX_PAGES) {
        throw new Error(tr(
          `Le PDF contient ${pdf.numPages} pages. Maximum : ${MAX_PAGES}.`,
          `The PDF contains ${pdf.numPages} pages. Maximum: ${MAX_PAGES}.`
        ));
      }

      const baseName = fileNameWithoutExtension(file.name);
      const slides = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (button) button.textContent = `⏳ ${pageNumber}/${pdf.numPages}`;
        slides.push(await renderPage(pdf, pageNumber, baseName));
      }

      await pdf.destroy?.();

      const existing = Array.isArray(currentSession.questions)
        ? [...currentSession.questions]
        : Object.values(currentSession.questions || {});

      await database.ref(`sessions/${currentSession.code}/questions`).set([...existing, ...slides]);

      window.showToast?.(tr(
        `${slides.length} page(s) importée(s) comme slide(s) !`,
        `${slides.length} page(s) imported as slide(s)!`
      ));
      window.closeModals?.();
      input.value = '';
    } catch (error) {
      console.error('Import PDF QuizLive :', error);
      window.showToast?.(error?.message || tr('Import PDF impossible.', 'PDF import failed.'), 'error');
    } finally {
      resetButton();
    }
  }

  // Surcharge uniquement les deux fonctions d'import après app.js.
  // Aucun code Firebase, Auth ou démarrage admin n'est modifié.
  window.showImportSlidesModal = () => {
    document.getElementById('importSlidesModal')?.classList.add('active');
  };
  window.handleSlidesImport = handlePdfImport;
  window.QuizLivePdfSlideImport = { version: VERSION, import: handlePdfImport };
})();
