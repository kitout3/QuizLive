// QuizLive - import direct de présentations PowerPoint (.pptx)
(() => {
    'use strict';

    const assets = {
        css: [
            'https://pptx.js.org/css/pptxjs.css',
            'https://pptx.js.org/css/nv.d3.min.css'
        ],
        scripts: [
            'https://code.jquery.com/jquery-1.11.3.min.js',
            'https://pptx.js.org/js/jszip.min.js',
            'https://cdn.jsdelivr.net/gh/meshesha/FileReader.js@master/filereader.js',
            'https://pptx.js.org/js/d3.min.js',
            'https://pptx.js.org/js/nv.d3.min.js',
            'https://pptx.js.org/js/pptxjs.js',
            'https://pptx.js.org/js/divs2slides.js',
            'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
        ]
    };

    function loadStyle(url) {
        if ([...document.styleSheets].some(sheet => sheet.href === url)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
    }

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            if ([...document.scripts].some(script => script.src === url)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Chargement impossible : ${url}`));
            document.head.appendChild(script);
        });
    }

    async function ensureDependencies() {
        assets.css.forEach(loadStyle);
        for (const url of assets.scripts) await loadScript(url);
    }

    function prepareImportUI() {
        const input = document.getElementById('slidesFileInput');
        if (!input) return;
        input.accept = 'image/*,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation';

        const label = document.querySelector('label[for="slidesFileInput"]');
        if (label) label.textContent = '📁 Sélectionner des images ou un PowerPoint';

        const modal = document.getElementById('importSlidesModal');
        const instruction = modal?.querySelector('.import-instructions p');
        if (instruction) {
            instruction.textContent = 'Importez directement un fichier PowerPoint .pptx ou plusieurs images. Chaque page sera ajoutée comme une slide indépendante.';
        }
    }

    function waitForSlides(container, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            let stableCount = 0;
            let previousCount = 0;

            const interval = setInterval(() => {
                const candidates = [...container.querySelectorAll('.slide, section, .pptx-slide')]
                    .filter(el => el.offsetWidth > 200 && el.offsetHeight > 100);
                const count = candidates.length;

                if (count > 0 && count === previousCount) stableCount++;
                else stableCount = 0;
                previousCount = count;

                if (stableCount >= 4) {
                    clearInterval(interval);
                    resolve(candidates);
                } else if (Date.now() - started > timeout) {
                    clearInterval(interval);
                    reject(new Error('Le PowerPoint n’a pas pu être converti dans le délai prévu'));
                }
            }, 500);
        });
    }

    async function renderPptxToImages(file) {
        await ensureDependencies();

        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;background:#fff;z-index:-1;';
        const input = document.createElement('input');
        input.type = 'file';
        input.id = `pptxHiddenInput_${Date.now()}`;
        const output = document.createElement('div');
        output.id = `pptxHiddenOutput_${Date.now()}`;
        host.append(input, output);
        document.body.appendChild(host);

        try {
            window.jQuery(output).pptxToHtml({
                fileInputId: input.id,
                slidesScale: '100%',
                slideMode: false,
                keyBoardShortCut: false,
                mediaProcess: false
            });

            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));

            const slideElements = await waitForSlides(output);
            const images = [];

            for (let index = 0; index < slideElements.length; index++) {
                const canvas = await html2canvas(slideElements[index], {
                    backgroundColor: '#ffffff',
                    scale: 1.4,
                    useCORS: true,
                    logging: false
                });
                images.push(canvas.toDataURL('image/jpeg', 0.88));
            }
            return images;
        } finally {
            host.remove();
        }
    }

    const originalHandleSlidesImport = window.handleSlidesImport;
    window.handleSlidesImport = async function handleSlidesOrPptxImport(event) {
        const files = [...(event.target.files || [])];
        if (!files.length) return;

        const pptxFiles = files.filter(file => file.name.toLowerCase().endsWith('.pptx'));
        const otherFiles = files.filter(file => !file.name.toLowerCase().endsWith('.pptx'));

        if (!pptxFiles.length) {
            return originalHandleSlidesImport?.(event);
        }

        if (pptxFiles.length > 1 || otherFiles.length) {
            showToast('Importez un seul fichier PowerPoint à la fois', 'error');
            event.target.value = '';
            return;
        }

        const button = document.getElementById('importSlidesBtn');
        const originalText = button?.textContent;
        if (button) {
            button.disabled = true;
            button.textContent = '⏳ Conversion du PowerPoint...';
        }

        try {
            const images = await renderPptxToImages(pptxFiles[0]);
            if (!images.length) throw new Error('Aucune slide détectée');

            const timestamp = Date.now();
            const slides = images.map((imageData, index) => ({
                type: 'slide',
                name: `${pptxFiles[0].name.replace(/\.pptx$/i, '')} — Slide ${index + 1}`,
                imageData,
                createdAt: timestamp + index
            }));

            const questions = [...(currentSession?.questions || []), ...slides];
            await database.ref(`sessions/${currentSession.code}/questions`).set(questions);
            showToast(`${slides.length} slides PowerPoint importées`);
            closeModals();
        } catch (error) {
            console.error('Erreur import PowerPoint :', error);
            showToast(`Import PowerPoint impossible : ${error.message}`, 'error');
        } finally {
            event.target.value = '';
            if (button) {
                button.disabled = false;
                button.textContent = originalText || 'Sélectionner les fichiers';
            }
        }
    };

    prepareImportUI();
    console.log('✅ Import PowerPoint activé');
})();