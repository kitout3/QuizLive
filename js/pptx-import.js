// QuizLive - import PPTX automatique, PDF et images
(() => {
  'use strict';
  const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  let pdfjsPromise;

  async function loadPdfJs() {
    if (!pdfjsPromise) pdfjsPromise = import(PDFJS_URL).then(lib => { lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL; return lib; });
    return pdfjsPromise;
  }

  function prepareImportUI() {
    const input = document.getElementById('slidesFileInput');
    if (!input) return;
    input.accept = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pdf,application/pdf,image/*';
    input.multiple = true;
    const label = document.querySelector('label[for="slidesFileInput"]');
    if (label) label.textContent = '📁 Sélectionner un PowerPoint, PDF ou des images';
    const button = document.getElementById('importSlidesBtn');
    if (button) button.textContent = 'Sélectionner le fichier';
    const instruction = document.querySelector('#importSlidesModal .import-instructions');
    if (instruction) instruction.innerHTML = '<p>Importez directement un fichier PowerPoint .pptx. Il sera converti automatiquement en images fidèles. Les PDF, PNG et JPG sont également acceptés.</p>';
  }

  async function saveSlides(slides) {
    if (!currentSession?.code) throw new Error('Session introuvable');
    await database.ref(`sessions/${currentSession.code}/questions`).set([...(currentSession.questions || []), ...slides]);
  }

  async function convertPptx(file) {
    const endpoint = String(window.PPTX_CONVERTER_URL_CONFIG || '').replace(/\/$/, '');
    if (!endpoint || endpoint.includes('%%')) throw new Error('Service de conversion PowerPoint non configuré');
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
    const token = await user.getIdToken(true);
    const body = new FormData(); body.append('file', file, file.name);
    const response = await fetch(`${endpoint}/convert`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur de conversion (${response.status})`);
    return data.slides || [];
  }

  async function renderPdf(file) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const slides = [];
    const baseName = file.name.replace(/\.pdf$/i, '');
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n); const base = page.getViewport({scale:1});
      const viewport = page.getViewport({scale:Math.min(1920/base.width, 2.5)});
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', {alpha:false}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      await page.render({canvasContext:ctx, viewport, background:'#fff'}).promise;
      slides.push({type:'slide', name:`${baseName} — Slide ${n}`, imageData:canvas.toDataURL('image/png'), createdAt:Date.now()+n});
      page.cleanup();
    }
    await pdf.destroy(); return slides;
  }

  function readImage(file) { return new Promise((resolve,reject) => { const r=new FileReader(); r.onload=e=>resolve({type:'slide',name:file.name.replace(/\.[^/.]+$/,''),imageData:e.target.result,createdAt:Date.now()}); r.onerror=()=>reject(new Error(`Lecture impossible : ${file.name}`)); r.readAsDataURL(file); }); }

  window.handleSlidesImport = async function(event) {
    const files = [...(event.target.files || [])]; if (!files.length) return;
    const pptx = files.filter(f => f.name.toLowerCase().endsWith('.pptx'));
    const pdf = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    const images = files.filter(f => f.type.startsWith('image/'));
    if ((pptx.length + pdf.length > 1) || ((pptx.length || pdf.length) && images.length)) { showToast('Importez un seul PowerPoint/PDF à la fois, ou uniquement plusieurs images', 'error'); event.target.value=''; return; }
    const button = document.getElementById('importSlidesBtn'); const text = button?.textContent;
    if (button) { button.disabled=true; button.textContent='⏳ Conversion en cours...'; }
    try {
      let slides;
      if (pptx.length) slides = await convertPptx(pptx[0]);
      else if (pdf.length) slides = await renderPdf(pdf[0]);
      else slides = await Promise.all(images.map(readImage));
      if (!slides?.length) throw new Error('Aucune slide générée');
      await saveSlides(slides); showToast(`${slides.length} slides importées`); closeModals();
    } catch (error) { console.error(error); showToast(`Import impossible : ${error.message}`, 'error'); }
    finally { event.target.value=''; if (button) { button.disabled=false; button.textContent=text || 'Sélectionner le fichier'; } }
  };

  prepareImportUI();
})();