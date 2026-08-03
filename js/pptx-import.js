// QuizLive - import fidèle de slides via PDF ou images
(() => {
    'use strict';

    const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
    const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    let pdfjsPromise = null;

    async function loadPdfJs() {
        if (!pdfjsPromise) {
            pdfjsPromise = import(PDFJS_URL).then(pdfjsLib => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                return pdfjsLib;
            });
        }
        return pdfjsPromise;
    }

    function prepareImportUI() {
        const input = document.getElementById('slidesFileInput');
        if (!input) return;

        input.accept = 'image/*,.pdf,application/pdf';
        input.multiple = true;

        const label = document.querySelector('label[for="slidesFileInput"]');
        if (label) label.textContent = '📁 Sélectionner un PDF ou des images';

        const button = document.getElementById('importSlidesBtn');
        if (button) button.textContent = 'Sélectionner le PDF ou les images';

        const modal = document.getElementById('importSlidesModal');
        const instruction = modal?.querySelector('.import-instructions');
        if (instruction) {
            instruction.innerHTML = `
                <p style="color: var(--text-secondary); margin-bottom: 16px;">
                    Pour conserver exactement la mise en page, les proportions et les polices de votre PowerPoint,
                    exportez-le d'abord en PDF puis importez ce PDF ici. Chaque page sera convertie en image indépendante.
                </p>
                <p style="color: var(--text-muted); font-size: 0.85rem;">
                    Dans PowerPoint : <strong>Fichier → Exporter → Créer un document PDF/XPS</strong><br>
                    Les fichiers PNG et JPG restent également acceptés.<br>
                    Le format .pptx direct n'est plus proposé car son rendu dans un navigateur peut déformer les slides.
                </p>
            `;
        }
    }

    async function renderPdfToImages(file) {
        const pdfjsLib = await loadPdfJs();
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const images = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });

            // Haute définition, tout en limitant les dimensions pour éviter
            // des images trop lourdes dans Firebase Realtime Database.
            const targetWidth = Math.min(1920, Math.max(1280, baseViewport.width * 2));
            const scale = targetWidth / baseViewport.width;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext('2d', { alpha: false });

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: context,
                viewport,
                background: '#ffffff'
            }).promise;

            // PNG conserve mieux les textes, traits et aplats que le JPEG.
            images.push(canvas.toDataURL('image/png'));
            page.cleanup();
        }

        await pdf.destroy();
        return images;
    }

    function readImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = event => resolve(event.target.result);
            reader.onerror = () => reject(new Error(`Lecture impossible : ${file.name}`));
            reader.readAsDataURL(file);
        });
    }

    async function saveSlides(slides) {
        if (!currentSession?.code) throw new Error('Session introuvable');
        const questions = [...(currentSession.questions || []), ...slides];
        await database.ref(`sessions/${currentSession.code}/questions`).set(questions);
    }

    window.handleSlidesImport = async function handleFaithfulSlideImport(event) {
        const files = [...(event.target.files || [])];
        if (!files.length) return;

        const pptxFile = files.find(file => file.name.toLowerCase().endsWith('.pptx'));
        if (pptxFile) {
            showToast('Pour un rendu identique, exportez le PowerPoint en PDF puis importez le PDF', 'error');
            event.target.value = '';
            return;
        }

        const pdfFiles = files.filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
        const imageFiles = files.filter(file => file.type.startsWith('image/'));

        if (pdfFiles.length > 1 || (pdfFiles.length && imageFiles.length)) {
            showToast('Importez un seul PDF à la fois, ou uniquement plusieurs images', 'error');
            event.target.value = '';
            return;
        }

        const button = document.getElementById('importSlidesBtn');
        const originalText = button?.textContent;
        if (button) {
            button.disabled = true;
            button.textContent = pdfFiles.length ? '⏳ Conversion du PDF...' : '⏳ Import des images...';
        }

        try {
            let slides = [];
            const timestamp = Date.now();

            if (pdfFiles.length === 1) {
                const pdfFile = pdfFiles[0];
                const images = await renderPdfToImages(pdfFile);
                const baseName = pdfFile.name.replace(/\.pdf$/i, '');
                slides = images.map((imageData, index) => ({
                    type: 'slide',
                    name: `${baseName} — Slide ${index + 1}`,
                    imageData,
                    createdAt: timestamp + index
                }));
            } else if (imageFiles.length) {
                const images = await Promise.all(imageFiles.map(readImage));
                slides = images.map((imageData, index) => ({
                    type: 'slide',
                    name: imageFiles[index].name.replace(/\.[^/.]+$/, ''),
                    imageData,
                    createdAt: timestamp + index
                }));
            } else {
                throw new Error('Format de fichier non pris en charge');
            }

            if (!slides.length) throw new Error('Aucune slide détectée');
            await saveSlides(slides);
            showToast(`${slides.length} slide${slides.length > 1 ? 's' : ''} importée${slides.length > 1 ? 's' : ''} fidèlement`);
            closeModals();
        } catch (error) {
            console.error('Erreur import des slides :', error);
            showToast(`Import impossible : ${error.message}`, 'error');
        } finally {
            event.target.value = '';
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Sélectionner le PDF ou les images';
            }
        }
    };

    prepareImportUI();
    console.log('✅ Import fidèle PDF/images activé');
})();