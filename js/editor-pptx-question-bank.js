(() => {
  'use strict';

  if (document.body?.dataset?.page !== 'editor') return;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = (value, max = 500) => String(value || '').trim().slice(0, max);
  const toArray = value => Array.isArray(value) ? value.filter(Boolean) : Object.keys(value || {}).sort((a,b)=>Number(a)-Number(b)).map(k=>value[k]).filter(Boolean);
  let user = null;
  let bankItems = [];

  function notify(message, error = false) {
    const status = $('saveStatus');
    if (status) {
      status.textContent = message;
      status.style.color = error ? '#fca5a5' : '#94a3b8';
    } else if (typeof showToast === 'function') showToast(message, error ? 'error' : 'success');
  }

  function sessionCode() {
    return new URLSearchParams(location.search).get('code') || '';
  }

  async function ensureSavedSession() {
    let code = sessionCode();
    if (code) return code;
    $('saveQuizBtn')?.click();
    for (let i = 0; i < 80; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      code = sessionCode();
      if (code) return code;
    }
    throw new Error('Enregistrez d’abord le quiz avant cet import.');
  }

  function converterEndpoint() {
    const fromWindow = window.PPTX_CONVERTER_URL_CONFIG;
    const fromGlobal = typeof PPTX_CONVERTER_URL_CONFIG !== 'undefined' ? PPTX_CONVERTER_URL_CONFIG : '';
    return String(fromWindow || fromGlobal || '').replace(/\/$/, '');
  }

  function normalizeConvertedSlide(slide, index, fileName) {
    return {
      type: 'slide',
      title: clean(slide.title || slide.name || `${fileName} — Slide ${index + 1}`, 160),
      image: slide.image || slide.imageData || slide.imageUrl || slide.slideUrl || slide.url || '',
      createdAt: Date.now() + index,
      source: 'pptx'
    };
  }

  async function importPptx(file) {
    if (!file) return;
    const endpoint = converterEndpoint();
    if (!endpoint || endpoint.includes('%%')) throw new Error('Le service de conversion PowerPoint n’est pas configuré.');
    if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise.');
    const code = await ensureSavedSession();
    notify('Conversion fidèle du PowerPoint…');

    const token = await user.getIdToken(true);
    const body = new FormData();
    body.append('file', file, file.name);
    const response = await fetch(`${endpoint}/convert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur de conversion (${response.status}).`);
    const slides = toArray(data.slides).map((slide, index) => normalizeConvertedSlide(slide, index, file.name)).filter(slide => slide.image);
    if (!slides.length) throw new Error('Le convertisseur n’a retourné aucune slide exploitable.');

    const snap = await database.ref(`sessions/${code}/questions`).once('value');
    const current = toArray(snap.val());
    await database.ref(`sessions/${code}`).update({ questions: [...current, ...slides], updatedAt: Date.now() });
    notify(`${slides.length} slide${slides.length > 1 ? 's' : ''} PowerPoint importée${slides.length > 1 ? 's' : ''}.`);
    location.reload();
  }

  function ensureBankDrawer() {
    let drawer = $('questionBankPanel');
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.id = 'questionBankPanel';
    drawer.className = 'editor-drawer';
    drawer.hidden = true;
    drawer.innerHTML = `
      <div class="editor-drawer-card editor-bank-card">
        <button id="closeQuestionBank" class="editor-close" type="button">×</button>
        <h2>📚 Banque de questions</h2>
        <p class="editor-bank-intro">Recherchez, sélectionnez et insérez des questions déjà enregistrées.</p>
        <div class="editor-bank-toolbar">
          <input id="questionBankSearch" type="search" placeholder="Rechercher une question">
          <button id="saveCurrentToBank" type="button" class="editor-secondary">Enregistrer la question actuelle</button>
        </div>
        <div id="questionBankList" class="editor-bank-list"><p>Chargement…</p></div>
        <button id="insertBankQuestions" type="button" class="btn-primary">Ajouter les questions sélectionnées</button>
      </div>`;
    document.body.appendChild(drawer);
    $('closeQuestionBank').onclick = () => { drawer.hidden = true; };
    $('questionBankSearch').oninput = event => drawBank(event.target.value);
    $('insertBankQuestions').onclick = insertSelectedBankQuestions;
    $('saveCurrentToBank').onclick = saveCurrentQuestionToBank;
    return drawer;
  }

  async function loadBank() {
    if (!user) return;
    const snap = await database.ref(`questionBanks/${user.uid}`).once('value');
    bankItems = Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value })).sort((a,b)=>Number(b.updatedAt || b.createdAt || 0)-Number(a.updatedAt || a.createdAt || 0));
    drawBank($('questionBankSearch')?.value || '');
  }

  function questionText(item) {
    return item.text || item.question || item.title || 'Question sans titre';
  }

  function drawBank(query = '') {
    const list = $('questionBankList');
    if (!list) return;
    const q = clean(query, 120).toLowerCase();
    const filtered = bankItems.filter(item => !q || questionText(item).toLowerCase().includes(q) || String(item.category || '').toLowerCase().includes(q));
    list.innerHTML = filtered.length ? filtered.map(item => {
      const options = toArray(item.options).map(option => typeof option === 'object' ? option.text : option).filter(Boolean);
      return `<label class="editor-bank-row">
        <input type="checkbox" class="editor-bank-check" value="${esc(item.id)}">
        <span><strong>${esc(questionText(item))}</strong><small>${esc(item.type === 'truefalse' ? 'Vrai / Faux' : item.type === 'wordcloud' ? 'Nuage de mots' : 'QCM')}${options.length ? ` · ${esc(options.join(' · '))}` : ''}</small></span>
      </label>`;
    }).join('') : '<p class="editor-bank-empty">Aucune question enregistrée.</p>';
  }

  async function openBank() {
    const drawer = ensureBankDrawer();
    drawer.hidden = false;
    await loadBank();
  }

  async function insertSelectedBankQuestions() {
    const ids = [...document.querySelectorAll('.editor-bank-check:checked')].map(input => input.value);
    if (!ids.length) return notify('Sélectionnez au moins une question.', true);
    try {
      const code = await ensureSavedSession();
      const selected = ids.map(id => bankItems.find(item => item.id === id)).filter(Boolean).map(item => ({
        type: item.type || 'mcq',
        text: clean(questionText(item)),
        options: toArray(item.options),
        correct: Number(item.correct ?? item.correctAnswer ?? 0),
        explanation: clean(item.explanation, 600),
        createdAt: Date.now(),
        sourceQuestionBankId: item.id
      }));
      const snap = await database.ref(`sessions/${code}/questions`).once('value');
      const current = toArray(snap.val());
      await database.ref(`sessions/${code}`).update({ questions: [...current, ...selected], updatedAt: Date.now() });
      notify(`${selected.length} question${selected.length > 1 ? 's' : ''} ajoutée${selected.length > 1 ? 's' : ''}.`);
      location.reload();
    } catch (error) {
      console.error(error);
      notify(error.message || 'Ajout impossible.', true);
    }
  }

  async function saveCurrentQuestionToBank() {
    try {
      const code = await ensureSavedSession();
      const active = document.querySelector('.editor-item.active');
      const index = Number(active?.dataset?.index);
      if (!Number.isInteger(index)) throw new Error('Sélectionnez une question dans le quiz.');
      const snap = await database.ref(`sessions/${code}/questions`).once('value');
      const item = toArray(snap.val())[index];
      if (!item || item.type === 'slide' || item.image || item.imageUrl || item.slideUrl) throw new Error('Une slide ne peut pas être enregistrée dans la banque de questions.');
      const id = database.ref(`questionBanks/${user.uid}`).push().key;
      await database.ref(`questionBanks/${user.uid}/${id}`).set({
        id,
        type: item.type || 'mcq',
        text: clean(questionText(item)),
        options: toArray(item.options),
        correctAnswer: Number(item.correct ?? item.correctAnswer ?? 0),
        explanation: clean(item.explanation, 600),
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      notify('Question enregistrée dans la banque.');
      await loadBank();
    } catch (error) {
      console.error(error);
      notify(error.message || 'Enregistrement impossible.', true);
    }
  }

  function bind() {
    $('pptxTool')?.addEventListener('click', () => $('pptxInput')?.click());
    $('pptxInput')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      try { await importPptx(file); }
      catch (error) { console.error(error); notify(error.message || 'Import PowerPoint impossible.', true); }
      finally { event.target.value = ''; }
    });
    $('questionBankTool')?.addEventListener('click', openBank);
  }

  bind();
  firebase.auth().onAuthStateChanged(current => { user = current && !current.isAnonymous ? current : null; });
})();