(() => {
  'use strict';

  const content = document.getElementById('dashboardContent');
  const title = document.getElementById('dashboardTitle');
  const subtitle = document.getElementById('dashboardSubtitle');
  const sidebar = document.getElementById('dashboardSidebar');
  if (!content || !title || !subtitle) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value || '').trim().replace(/[<>"'&]/g, '').slice(0, 120);
  let currentUser = null;
  let quizItems = [];
  let selectedCode = null;

  function setHeading(main, sub) {
    title.textContent = main;
    subtitle.textContent = sub;
  }

  function notify(text, type = 'success') {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    const notice = document.createElement('div');
    notice.className = `dashboard-notice ${type}`;
    notice.textContent = text;
    content.prepend(notice);
    setTimeout(() => notice.remove(), 3500);
  }

  function valuesOfCollection(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return Object.values(value || {}).filter(Boolean);
  }

  function questionLabel(item, index) {
    if (item?.type === 'slide' || item?.slideUrl || item?.imageUrl || item?.image) return `Slide ${index + 1}`;
    return item?.text || item?.question || item?.title || `Question ${index + 1}`;
  }

  function itemKind(item) {
    return item?.type === 'slide' || item?.slideUrl || item?.imageUrl || item?.image ? 'Slide' : 'Question';
  }

  function imageSource(item) {
    return item?.slideUrl || item?.imageUrl || item?.image || item?.src || '';
  }

  async function loadQuizLibrary() {
    const indexSnap = await database.ref(`organizerSessions/${currentUser.uid}`).once('value');
    const indexed = Object.entries(indexSnap.val() || {}).map(([code, value]) => ({ code, ...value }));
    indexed.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    const full = await Promise.all(indexed.map(async item => {
      const snap = await database.ref(`sessions/${item.code}`).once('value');
      const session = snap.val() || {};
      const questions = valuesOfCollection(session.questions);
      return {
        ...item,
        session,
        name: session.name || item.name || item.code,
        status: session.status || item.status || 'waiting',
        createdAt: session.createdAt || item.createdAt || 0,
        questions,
        participantCount: Object.keys(session.participants || {}).length,
        slideCount: questions.filter(q => itemKind(q) === 'Slide').length,
        questionCount: questions.filter(q => itemKind(q) === 'Question').length
      };
    }));

    // Ignore stale index entries whose session no longer exists.
    quizItems = full.filter(item => item.session.ownerUid === currentUser.uid);
  }

  function statusLabel(status) {
    const map = { waiting: 'En préparation', active: 'En cours', finished: 'Terminé', ended: 'Terminé' };
    return map[status] || status || 'En préparation';
  }

  function renderPreview(item) {
    selectedCode = item?.code || null;
    const preview = document.getElementById('quizLibraryPreview');
    if (!preview) return;
    document.querySelectorAll('.quiz-library-card').forEach(card => card.classList.toggle('selected', card.dataset.code === selectedCode));

    if (!item) {
      preview.innerHTML = '<div class="quiz-preview-empty"><span>👁️</span><h3>Sélectionnez un quiz</h3><p>Son contenu et ses informations apparaîtront ici.</p></div>';
      return;
    }

    const elements = item.questions.slice(0, 30);
    preview.innerHTML = `
      <div class="quiz-preview-header">
        <div><span class="dashboard-badge">${esc(statusLabel(item.status))}</span><h2>${esc(item.name)}</h2><p class="dashboard-muted">Code ${esc(item.code)} · ${item.createdAt ? new Date(Number(item.createdAt)).toLocaleString('fr-FR') : ''}</p></div>
        <a class="btn-primary" href="admin.html?code=${encodeURIComponent(item.code)}">Ouvrir l’éditeur</a>
      </div>
      <div class="quiz-preview-stats">
        <span><strong>${item.questionCount}</strong> questions</span>
        <span><strong>${item.slideCount}</strong> slides</span>
        <span><strong>${item.participantCount}</strong> participants</span>
      </div>
      <div class="quiz-preview-content">
        ${elements.length ? elements.map((entry, index) => {
          const src = imageSource(entry);
          return `<article class="quiz-preview-item">
            <div class="quiz-preview-number">${index + 1}</div>
            <div class="quiz-preview-item-body">
              <small>${itemKind(entry)}</small>
              ${src ? `<img src="${esc(src)}" alt="Aperçu de la slide ${index + 1}" loading="lazy">` : `<strong>${esc(questionLabel(entry, index))}</strong>`}
              ${!src && Array.isArray(entry.options) ? `<p>${entry.options.slice(0,4).map(option => esc(typeof option === 'object' ? option.text : option)).join(' · ')}</p>` : ''}
            </div>
          </article>`;
        }).join('') : '<p class="dashboard-muted">Ce quiz ne contient encore aucune question ou slide.</p>'}
      </div>`;
  }

  function drawQuizCards(query = '') {
    const grid = document.getElementById('quizLibraryGrid');
    if (!grid) return;
    const q = String(query || '').trim().toLowerCase();
    const filtered = quizItems.filter(item => !q || item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q));

    grid.innerHTML = filtered.length ? filtered.map(item => `
      <article class="quiz-library-card ${item.code === selectedCode ? 'selected' : ''}" data-code="${esc(item.code)}">
        <button type="button" class="quiz-library-main" data-preview="${esc(item.code)}">
          <div class="quiz-library-icon">${item.slideCount > item.questionCount ? '🖼️' : '❓'}</div>
          <div class="quiz-library-info">
            <h3>${esc(item.name)}</h3>
            <p>${esc(item.code)} · ${item.questions.length} élément${item.questions.length > 1 ? 's' : ''}</p>
            <small>${item.createdAt ? new Date(Number(item.createdAt)).toLocaleDateString('fr-FR') : ''} · ${statusLabel(item.status)}</small>
          </div>
        </button>
        <div class="quiz-library-actions">
          <a href="admin.html?code=${encodeURIComponent(item.code)}" aria-label="Ouvrir ${esc(item.name)}">Ouvrir</a>
          <button type="button" data-duplicate="${esc(item.code)}">Dupliquer</button>
          <button type="button" class="danger" data-delete="${esc(item.code)}">Supprimer</button>
        </div>
      </article>`).join('') : '<div class="dashboard-empty">Aucun quiz ne correspond à votre recherche.</div>';

    grid.querySelectorAll('[data-preview]').forEach(button => {
      button.onclick = () => renderPreview(quizItems.find(item => item.code === button.dataset.preview));
    });
    grid.querySelectorAll('[data-duplicate]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        duplicateQuiz(button.dataset.duplicate);
      };
    });
    grid.querySelectorAll('[data-delete]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        deleteQuiz(button.dataset.delete);
      };
    });
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  async function uniqueCode() {
    for (let attempt = 0; attempt < 40; attempt++) {
      const code = generateCode();
      if (!(await database.ref(`sessions/${code}`).once('value')).exists()) return code;
    }
    throw new Error('Impossible de générer un nouveau code de session.');
  }

  async function duplicateQuiz(sourceCode) {
    const sourceItem = quizItems.find(item => item.code === sourceCode);
    if (!sourceItem) return;
    const suggested = `${sourceItem.name} - Copie`;
    const requestedName = prompt('Nom du quiz dupliqué', suggested);
    if (requestedName === null) return;
    const name = clean(requestedName);
    if (name.length < 2) return notify('Le nom du quiz est trop court.', 'error');

    try {
      const newCode = await uniqueCode();
      const now = Date.now();
      const source = sourceItem.session;
      const duplicate = {
        ...source,
        code: newCode,
        name,
        ownerUid: currentUser.uid,
        createdAt: now,
        updatedAt: now,
        status: 'waiting',
        currentQuestion: -1,
        participants: {},
        presenterMode: false
      };
      delete duplicate.startedAt;
      delete duplicate.finishedAt;
      delete duplicate.endedAt;
      delete duplicate.results;

      const updates = {};
      updates[`sessions/${newCode}`] = duplicate;
      updates[`organizerSessions/${currentUser.uid}/${newCode}`] = {
        code: newCode,
        name,
        createdAt: now,
        status: 'waiting',
        organizationId: duplicate.organizationId || ''
      };
      await database.ref().update(updates);
      notify('Quiz dupliqué.');
      await refreshLibrary(newCode);
    } catch (error) {
      console.error(error);
      notify(error.message || 'Duplication impossible.', 'error');
    }
  }

  async function cleanSessionPseudos(code) {
    try {
      const snap = await database.ref(`sessionPseudos/${code}`).once('value');
      const pseudos = snap.val() || {};
      const removals = Object.keys(pseudos).map(key => database.ref(`sessionPseudos/${code}/${key}`).remove());
      await Promise.allSettled(removals);
    } catch (error) {
      console.warn('Nettoyage des pseudos non bloquant :', error);
    }
  }

  async function deleteQuiz(code) {
    const item = quizItems.find(entry => entry.code === code);
    if (!item) return;
    const confirmation = confirm(`Supprimer définitivement « ${item.name} » ?\n\nCette action efface la session, ses participants et ses résultats.`);
    if (!confirmation) return;

    try {
      // Remove the two authoritative records first. Pseudo cleanup must not cancel deletion.
      await database.ref().update({
        [`sessions/${code}`]: null,
        [`organizerSessions/${currentUser.uid}/${code}`]: null
      });

      await cleanSessionPseudos(code);
      quizItems = quizItems.filter(entry => entry.code !== code);
      selectedCode = null;
      drawQuizCards(document.getElementById('quizLibrarySearch')?.value || '');
      renderPreview(null);
      const counter = document.getElementById('quizLibraryCount');
      if (counter) counter.textContent = `${quizItems.length} quiz`;
      notify('Quiz supprimé.');

      // Confirm against Firebase after updating the interface.
      await refreshLibrary();
    } catch (error) {
      console.error(error);
      notify(error?.code === 'PERMISSION_DENIED' ? 'Suppression refusée par les règles Firebase.' : 'Suppression impossible.', 'error');
    }
  }

  async function refreshLibrary(previewCode = null) {
    const search = document.getElementById('quizLibrarySearch')?.value || '';
    await loadQuizLibrary();
    selectedCode = previewCode && quizItems.some(item => item.code === previewCode) ? previewCode : null;
    drawQuizCards(search);
    renderPreview(selectedCode ? quizItems.find(item => item.code === selectedCode) : null);
    const counter = document.getElementById('quizLibraryCount');
    if (counter) counter.textContent = `${quizItems.length} quiz`;
  }

  async function renderQuizLibrary() {
    setHeading('Mes quiz', 'Recherchez, prévisualisez, dupliquez ou supprimez vos quiz.');
    content.innerHTML = '<div class="dashboard-loading">Chargement de votre bibliothèque…</div>';
    await loadQuizLibrary();
    content.innerHTML = `
      <div class="quiz-library-toolbar">
        <div><strong id="quizLibraryCount">${quizItems.length} quiz</strong><p class="dashboard-muted">Tous les quiz de votre compte organisateur.</p></div>
        <div class="quiz-library-toolbar-actions"><input id="quizLibrarySearch" type="search" placeholder="Rechercher par nom ou code"><a class="btn-primary" href="index.html?create=1">+ Nouveau quiz</a></div>
      </div>
      <div class="quiz-library-layout">
        <section id="quizLibraryGrid" class="quiz-library-grid"></section>
        <aside id="quizLibraryPreview" class="quiz-library-preview"></aside>
      </div>`;
    drawQuizCards('');
    renderPreview(null);
    document.getElementById('quizLibrarySearch').oninput = event => drawQuizCards(event.target.value);
  }

  function activateQuizSection() {
    document.querySelectorAll('.dashboard-nav-item[data-section], .dashboard-nav-item[data-stage3-section]').forEach(button => {
      const section = button.dataset.section || button.dataset.stage3Section;
      button.classList.toggle('active', section === 'quizzes');
    });
    sidebar?.classList.remove('open');
    const url = new URL(location.href);
    url.searchParams.set('section', 'quizzes');
    history.replaceState({}, '', url);
    renderQuizLibrary().catch(error => {
      console.error(error);
      content.innerHTML = `<div class="dashboard-empty">${esc(error.message || 'Impossible de charger les quiz.')}</div>`;
    });
  }

  function bindQuizButton() {
    const button = document.querySelector('.dashboard-nav-item[data-section="quizzes"]');
    if (button) button.onclick = activateQuizSection;
  }

  firebase.auth().onAuthStateChanged(user => {
    if (!user || user.isAnonymous) return;
    currentUser = user;
    bindQuizButton();
    if (new URLSearchParams(location.search).get('section') === 'quizzes') activateQuizSection();
  });
})();