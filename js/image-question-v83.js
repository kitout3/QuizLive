// QuizLive — questions avec image (v83)
(() => {
  'use strict';

  const VERSION = '83';
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_DIMENSION = 1200;
  const TARGET_DATA_BYTES = 320 * 1024;

  let newImageData = '';
  let editImageData = '';
  let imageCorrectAnswer = 0;
  let editImageCorrectAnswer = 0;

  const tr = (fr, en) => {
    const lang = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(lang).toLowerCase().startsWith('en') ? en : fr;
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function approxDataBytes(dataUrl) {
    const payload = String(dataUrl || '').split(',')[1] || '';
    return Math.ceil(payload.length * 0.75);
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(tr('Lecture de l’image impossible.', 'Unable to read the image.')));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error(tr('Image invalide.', 'Invalid image.')));
        image.onload = () => resolve(image);
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function optimizeImage(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error(tr('Sélectionnez une image.', 'Select an image.'));
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(tr('L’image dépasse 8 Mo.', 'The image exceeds 8 MB.'));
    }

    const image = await fileToImage(file);
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (approxDataBytes(dataUrl) > TARGET_DATA_BYTES && quality > 0.42) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  }

  function imageOptions(prefix = '', editing = false, question = null) {
    const values = question?.options || ['', '', '', ''];
    const correct = editing ? editImageCorrectAnswer : imageCorrectAnswer;
    return `
      <div class="ql-image-question-editor">
        <div class="ql-image-upload">
          <input type="file" id="${prefix}questionImageInput" accept="image/*" hidden>
          <button type="button" class="ql-image-upload-button" id="${prefix}questionImageButton">
            🖼️ ${tr(editing ? 'Remplacer l’image' : 'Choisir une image', editing ? 'Replace image' : 'Choose an image')}
          </button>
          <span class="ql-image-help">${tr('JPG, PNG, WEBP · optimisation automatique', 'JPG, PNG, WEBP · automatic optimization')}</span>
        </div>
        <div id="${prefix}questionImagePreview" class="ql-image-preview ${question?.imageData ? 'has-image' : ''}">
          ${question?.imageData ? `<img src="${question.imageData}" alt="">` : `<span>${tr('Aucune image sélectionnée', 'No image selected')}</span>`}
        </div>
        <div class="options-creator ql-image-options">
          ${['A', 'B', 'C', 'D'].map((letter, i) => `
            <div class="option-input-row">
              <div class="option-color opt-${letter.toLowerCase()}">${letter}</div>
              <input type="text" id="${prefix}imageOption${i}" value="${esc(values[i] || '')}" placeholder="Option ${letter}" class="form-group">
              <button type="button" class="correct-toggle ${correct === i ? 'active' : ''}" data-image-correct="${i}" data-image-edit="${editing ? '1' : '0'}">✓ ${tr('Correcte', 'Correct')}</button>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function installStyles() {
    if (document.getElementById('qlImageQuestionStyles')) return;
    const style = document.createElement('style');
    style.id = 'qlImageQuestionStyles';
    style.textContent = `
      .question-type-selector{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:10px!important}
      .ql-image-upload{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .ql-image-upload-button{border:1px dashed rgba(139,92,246,.72);background:rgba(99,102,241,.10);color:#fff;border-radius:12px;padding:12px 16px;font:600 .9rem Outfit,sans-serif;cursor:pointer}
      .ql-image-upload-button:hover{background:rgba(139,92,246,.18);border-color:#a78bfa}
      .ql-image-help{font-size:.78rem;color:var(--text-muted)}
      .ql-image-preview{min-height:130px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(0,0,0,.16);color:var(--text-muted);overflow:hidden;margin-bottom:16px}
      .ql-image-preview img{display:block;width:100%;max-height:280px;object-fit:contain;background:#0c0d1d}
      .ql-question-image{display:block;width:min(100%,760px);max-height:360px;object-fit:contain;margin:14px auto 20px;border-radius:16px;background:#0b0d1d;border:1px solid rgba(255,255,255,.10)}
      .player-question .ql-question-image{max-height:300px;margin-top:12px}
      .presenter-question .ql-question-image{max-height:46vh;width:min(82vw,1000px)}
      @media(max-width:760px){.question-type-selector{grid-template-columns:repeat(2,minmax(0,1fr))!important}.question-type-selector .type-btn:last-child{grid-column:span 2}.ql-question-image{max-height:260px}}
    `;
    document.head.appendChild(style);
  }

  function addImageTab() {
    const selector = document.querySelector('#addQuestionModal .question-type-selector');
    if (!selector || selector.querySelector('[data-type="image"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'type-btn';
    button.dataset.type = 'image';
    button.innerHTML = `<span class="type-icon">🖼️</span>${tr('Image', 'Image')}`;
    button.onclick = () => window.selectQuestionType('image');
    selector.appendChild(button);
  }

  function bindImageEditor(prefix = '', editing = false) {
    const input = document.getElementById(`${prefix}questionImageInput`);
    const button = document.getElementById(`${prefix}questionImageButton`);
    const preview = document.getElementById(`${prefix}questionImagePreview`);
    if (!input || !button || !preview) return;

    button.onclick = () => input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      button.disabled = true;
      button.textContent = tr('⏳ Optimisation…', '⏳ Optimizing…');
      try {
        const data = await optimizeImage(file);
        if (editing) editImageData = data;
        else newImageData = data;
        preview.classList.add('has-image');
        preview.innerHTML = `<img src="${data}" alt="">`;
      } catch (error) {
        window.showToast?.(error.message, 'error');
      } finally {
        button.disabled = false;
        button.textContent = `🖼️ ${tr(editing ? 'Remplacer l’image' : 'Choisir une image', editing ? 'Replace image' : 'Choose an image')}`;
      }
    };

    document.querySelectorAll(`[data-image-edit="${editing ? '1' : '0'}"]`).forEach(correctButton => {
      correctButton.onclick = () => {
        const index = Number(correctButton.dataset.imageCorrect || 0);
        if (editing) editImageCorrectAnswer = index;
        else imageCorrectAnswer = index;
        document.querySelectorAll(`[data-image-edit="${editing ? '1' : '0'}"]`)
          .forEach(item => item.classList.toggle('active', Number(item.dataset.imageCorrect) === index));
      };
    });
  }

  function injectQuestionImage(container, imageData) {
    if (!container || !imageData || container.querySelector('.ql-question-image')) return;
    const image = document.createElement('img');
    image.className = 'ql-question-image';
    image.src = imageData;
    image.alt = tr('Image de la question', 'Question image');
    const textNode = container.querySelector('.question-text,.player-question-text,.presenter-text');
    if (textNode) textNode.insertAdjacentElement('afterend', image);
    else container.prepend(image);
  }

  function install() {
    installStyles();
    addImageTab();

    const originalSelect = window.selectQuestionType;
    const originalSave = window.saveQuestion;
    const originalEdit = window.showEditModal;
    const originalUpdate = window.updateQuestion;
    const originalTypeLabel = window.getQuestionTypeLabel;
    const originalAdminDisplay = window.updateCurrentQuestionDisplay;
    const originalPlayerDisplay = window.updatePlayerUI;
    const originalPresenterDisplay = window.renderPresenterView;

    window.selectQuestionType = type => {
      if (type !== 'image') return originalSelect(type);
      document.querySelectorAll('#addQuestionModal .type-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelector('#addQuestionModal [data-type="image"]')?.classList.add('active');
      document.getElementById('selectedQuestionType').value = 'image';
      newImageData = '';
      imageCorrectAnswer = 0;
      document.getElementById('questionOptionsContainer').innerHTML = imageOptions('', false, null);
      bindImageEditor('', false);
    };

    window.saveQuestion = async event => {
      const type = document.getElementById('selectedQuestionType')?.value;
      if (type !== 'image') return originalSave(event);
      event.preventDefault();

      const text = document.getElementById('questionText')?.value.trim() || '';
      if (!text) return window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');
      if (!newImageData) return window.showToast?.(tr('Ajoutez une image à la question.', 'Add an image to the question.'), 'error');

      const options = [0,1,2,3]
        .map(i => document.getElementById(`imageOption${i}`)?.value.trim() || '')
        .filter(Boolean);
      if (options.length < 2) return window.showToast?.(tr('Ajoutez au moins 2 options', 'Add at least 2 options'), 'error');
      if (!currentSession?.code) return window.showToast?.(tr('Quiz non chargé.', 'Quiz not loaded.'), 'error');

      const questions = Array.isArray(currentSession.questions)
        ? [...currentSession.questions]
        : Object.values(currentSession.questions || {});
      questions.push({
        type: 'image',
        text,
        imageData: newImageData,
        options,
        correct: Math.min(imageCorrectAnswer, options.length - 1),
        createdAt: Date.now()
      });

      try {
        await database.ref(`sessions/${currentSession.code}/questions`).set(questions);
        window.showToast?.(tr('Question avec image ajoutée !', 'Image question added!'));
        window.closeModals?.();
        document.getElementById('addQuestionForm')?.reset();
        newImageData = '';
      } catch (error) {
        console.error('Question image :', error);
        window.showToast?.(error.message || tr('Enregistrement impossible.', 'Unable to save.'), 'error');
      }
    };

    window.showEditModal = index => {
      const question = currentSession?.questions?.[index];
      if (question?.type !== 'image') return originalEdit(index);
      editingQuestionIndex = index;
      editImageData = question.imageData || '';
      editImageCorrectAnswer = Number(question.correct || 0);
      document.getElementById('editQuestionModal')?.classList.add('active');
      document.getElementById('editQuestionText').value = question.text || '';
      document.getElementById('editSelectedQuestionType').value = 'image';
      document.getElementById('editQuestionOptionsContainer').innerHTML = imageOptions('edit', true, question);
      bindImageEditor('edit', true);
    };

    window.updateQuestion = async event => {
      const index = editingQuestionIndex;
      const question = index !== null ? currentSession?.questions?.[index] : null;
      if (question?.type !== 'image') return originalUpdate(event);
      event.preventDefault();

      const text = document.getElementById('editQuestionText')?.value.trim() || '';
      const options = [0,1,2,3]
        .map(i => document.getElementById(`editimageOption${i}`)?.value.trim() || '')
        .filter(Boolean);
      if (!text) return window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');
      if (!editImageData) return window.showToast?.(tr('Ajoutez une image.', 'Add an image.'), 'error');
      if (options.length < 2) return window.showToast?.(tr('Ajoutez au moins 2 options', 'Add at least 2 options'), 'error');

      try {
        await database.ref(`sessions/${currentSession.code}/questions/${index}`).set({
          ...question,
          text,
          imageData: editImageData,
          options,
          correct: Math.min(editImageCorrectAnswer, options.length - 1)
        });
        window.showToast?.(tr('Question mise à jour !', 'Question updated!'));
        window.closeModals?.();
        editingQuestionIndex = null;
      } catch (error) {
        window.showToast?.(error.message || tr('Modification impossible.', 'Unable to update.'), 'error');
      }
    };

    window.getQuestionTypeLabel = type => type === 'image'
      ? `🖼️ ${tr('Image', 'Image')}`
      : originalTypeLabel(type);

    window.updateCurrentQuestionDisplay = () => {
      const index = currentSession?.currentQuestion;
      const question = Array.isArray(currentSession?.questions) ? currentSession.questions[index] : null;
      if (question?.type !== 'image') return originalAdminDisplay();
      window.renderMCQAdmin({ ...question, type: 'mcq' }, index);
      injectQuestionImage(document.getElementById('questionDisplay'), question.imageData);
    };

    window.updatePlayerUI = () => {
      if (!playerSession) return originalPlayerDisplay();
      if (playerSession.status === 'finished') return originalPlayerDisplay();
      const index = playerSession.currentQuestion;
      const question = playerSession.questions?.[index];
      if (question?.type !== 'image') return originalPlayerDisplay();
      const player = playerSession.participants?.[playerId];
      const scoreDisplay = document.getElementById('playerScore');
      if (scoreDisplay && player) scoreDisplay.textContent = player.score || 0;
      window.renderPlayerMCQ({ ...question, type: 'mcq' }, index);
      injectQuestionImage(document.getElementById('playerContent'), question.imageData);
    };

    window.renderPresenterView = session => {
      const index = session?.currentQuestion;
      const question = session?.questions?.[index];
      if (question?.type !== 'image') return originalPresenterDisplay(session);
      window.renderPresenterMCQ(session, { ...question, type: 'mcq' }, index);
      injectQuestionImage(document.getElementById('presenterContent'), question.imageData);
    };

    document.addEventListener('quizlive:languagechange', addImageTab);
    window.addEventListener('quizlive-language-change', addImageTab);
  }

  window.QuizLiveImageQuestions = { version: VERSION, optimizeImage };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
