// QuizLive — réponses QCM variables : 1 à 4 choix avec suppression par croix.
(() => {
  'use strict';

  const VERSION = '89';
  const LETTERS = ['A', 'B', 'C', 'D'];
  let editingIndex = null;

  const tr = (fr, en) => {
    const lang = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(lang).toLowerCase().startsWith('en') ? en : fr;
  };

  function installStyles() {
    if (document.getElementById('qlVariableChoicesStyles')) return;
    const style = document.createElement('style');
    style.id = 'qlVariableChoicesStyles';
    style.textContent = `
      .ql-variable-choice-row{position:relative;display:grid!important;grid-template-columns:auto minmax(0,1fr) auto 36px!important;gap:10px!important;align-items:center!important}
      .ql-choice-remove{display:grid;place-items:center;width:34px;height:34px;min-width:34px;padding:0;border:1px solid rgba(248,113,113,.30);border-radius:50%;background:rgba(239,68,68,.08);color:#fca5a5;font:500 21px/1 Arial,sans-serif;cursor:pointer;transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease,opacity .18s ease}
      .ql-choice-remove:hover:not(:disabled){background:rgba(239,68,68,.18);border-color:rgba(248,113,113,.58);color:#fff;transform:scale(1.06)}
      .ql-choice-remove:disabled{opacity:.22;cursor:not-allowed}
      .ql-choice-add{display:none;width:100%;margin-top:10px;padding:10px 14px;border:1px dashed rgba(139,92,246,.48);border-radius:11px;background:rgba(139,92,246,.07);color:#c4b5fd;font:600 .84rem Outfit,sans-serif;cursor:pointer}
      .ql-choice-add.visible{display:block}
      .ql-choice-add:hover{background:rgba(139,92,246,.14);border-color:rgba(167,139,250,.75);color:#fff}
      @media(max-width:620px){.ql-variable-choice-row{grid-template-columns:auto minmax(0,1fr) 34px!important}.ql-variable-choice-row .correct-toggle{grid-column:2 / 4;width:100%}.ql-choice-remove{grid-column:3;grid-row:1}}
    `;
    document.head.appendChild(style);
  }

  function containerKind(container) {
    if (!container) return null;
    if (container.id === 'questionOptionsContainer') {
      return document.getElementById('selectedQuestionType')?.value === 'image' ? 'image-new' : 'mcq-new';
    }
    if (container.id === 'editQuestionOptionsContainer') {
      const type = document.getElementById('editSelectedQuestionType')?.value;
      return type === 'image' ? 'image-edit' : 'mcq-edit';
    }
    return null;
  }

  function visibleRows(container) {
    return [...(container?.querySelectorAll('.option-input-row') || [])]
      .filter(row => row.dataset.qlChoiceRemoved !== '1');
  }

  function allRows(container) {
    return [...(container?.querySelectorAll('.option-input-row') || [])];
  }

  function rowInput(row) {
    return row?.querySelector('input[type="text"]');
  }

  function rowCorrectButton(row) {
    return row?.querySelector('.correct-toggle');
  }

  function renumber(container) {
    const rows = visibleRows(container);

    rows.forEach((row, index) => {
      row.dataset.qlChoiceOrder = String(index);
      const letter = LETTERS[index];
      const badge = row.querySelector('.option-color');
      if (badge) {
        badge.textContent = letter;
        badge.classList.remove('opt-a', 'opt-b', 'opt-c', 'opt-d');
        badge.classList.add(`opt-${letter.toLowerCase()}`);
      }
      const input = rowInput(row);
      if (input) input.placeholder = `${tr('Option', 'Option')} ${letter}`;
    });

    const active = rows.find(row => rowCorrectButton(row)?.classList.contains('active'));
    if (!active && rows[0]) rowCorrectButton(rows[0])?.classList.add('active');

    rows.forEach(row => {
      const remove = row.querySelector('.ql-choice-remove');
      if (remove) remove.disabled = rows.length <= 1;
    });

    const add = container?.querySelector('.ql-choice-add');
    if (add) add.classList.toggle('visible', rows.length < 4);
  }

  function bindCorrectButtons(container) {
    visibleRows(container).forEach(row => {
      const button = rowCorrectButton(row);
      if (!button || button.dataset.qlChoiceBound === '1') return;
      button.dataset.qlChoiceBound = '1';
      button.removeAttribute('onclick');
      button.addEventListener('click', event => {
        event.preventDefault();
        visibleRows(container).forEach(item => rowCorrectButton(item)?.classList.remove('active'));
        button.classList.add('active');
      });
    });
  }

  function removeRow(container, row) {
    const rows = visibleRows(container);
    if (rows.length <= 1) {
      window.showToast?.(tr('Une question doit conserver au moins une réponse.', 'A question must keep at least one answer.'), 'error');
      return;
    }

    const wasCorrect = rowCorrectButton(row)?.classList.contains('active');
    row.dataset.qlChoiceRemoved = '1';
    row.style.display = 'none';
    rowCorrectButton(row)?.classList.remove('active');

    if (wasCorrect) {
      const remaining = visibleRows(container);
      rowCorrectButton(remaining[0])?.classList.add('active');
    }

    renumber(container);
  }

  function restoreRow(container) {
    const hidden = allRows(container).find(row => row.dataset.qlChoiceRemoved === '1');
    if (!hidden) return;
    hidden.dataset.qlChoiceRemoved = '0';
    hidden.style.display = '';
    const input = rowInput(hidden);
    if (input) input.value = '';
    rowCorrectButton(hidden)?.classList.remove('active');
    bindCorrectButtons(container);
    renumber(container);
    input?.focus();
  }

  function ensureControls(container) {
    if (!container) return;
    const kind = containerKind(container);
    if (!kind || (!kind.startsWith('mcq') && !kind.startsWith('image'))) return;

    const rows = allRows(container);
    if (!rows.length) return;

    rows.forEach(row => {
      row.classList.add('ql-variable-choice-row');
      if (!row.querySelector('.ql-choice-remove')) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ql-choice-remove';
        remove.textContent = '×';
        remove.title = tr('Supprimer cette réponse', 'Remove this answer');
        remove.setAttribute('aria-label', remove.title);
        remove.addEventListener('click', () => removeRow(container, row));
        row.appendChild(remove);
      }
    });

    const creator = container.querySelector('.options-creator');
    if (creator && !container.querySelector('.ql-choice-add')) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'ql-choice-add';
      add.textContent = tr('+ Ajouter une réponse', '+ Add an answer');
      add.addEventListener('click', () => restoreRow(container));
      creator.insertAdjacentElement('afterend', add);
    }

    bindCorrectButtons(container);
    renumber(container);
  }

  function trimToExistingCount(container, count) {
    const rows = allRows(container);
    rows.forEach((row, index) => {
      const shouldShow = index < Math.max(1, Math.min(4, Number(count) || 1));
      row.dataset.qlChoiceRemoved = shouldShow ? '0' : '1';
      row.style.display = shouldShow ? '' : 'none';
    });
    renumber(container);
  }

  function collectChoices(container) {
    const rows = visibleRows(container);
    const choices = [];
    let correct = 0;

    for (const row of rows) {
      const value = rowInput(row)?.value.trim() || '';
      if (!value) continue;
      if (rowCorrectButton(row)?.classList.contains('active')) correct = choices.length;
      choices.push(value);
    }

    if (choices.length === 0) return { choices: [], correct: 0 };
    correct = Math.max(0, Math.min(correct, choices.length - 1));
    return { choices, correct };
  }

  function imageDataFrom(container, editing = false) {
    const previewId = editing ? 'editquestionImagePreview' : 'questionImagePreview';
    return document.getElementById(previewId)?.querySelector('img')?.src || '';
  }

  async function saveMcq(event) {
    event.preventDefault();
    const text = document.getElementById('questionText')?.value.trim() || '';
    if (!text) return window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');

    const container = document.getElementById('questionOptionsContainer');
    const { choices, correct } = collectChoices(container);
    if (!choices.length) return window.showToast?.(tr('Ajoutez au moins une réponse.', 'Add at least one answer.'), 'error');
    if (!currentSession?.code) return window.showToast?.(tr('Quiz non chargé.', 'Quiz not loaded.'), 'error');

    const questions = Array.isArray(currentSession.questions)
      ? [...currentSession.questions]
      : Object.values(currentSession.questions || {});
    questions.push({ type: 'mcq', text, options: choices, correct, createdAt: Date.now() });

    try {
      await database.ref(`sessions/${currentSession.code}/questions`).set(questions);
      window.showToast?.(tr('Question ajoutée !', 'Question added!'));
      window.closeModals?.();
      document.getElementById('addQuestionForm')?.reset();
    } catch (error) {
      console.error('QCM variable :', error);
      window.showToast?.(error?.message || tr('Enregistrement impossible.', 'Unable to save.'), 'error');
    }
  }

  async function saveImage(event) {
    event.preventDefault();
    const text = document.getElementById('questionText')?.value.trim() || '';
    if (!text) return window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');

    const imageData = imageDataFrom(document.getElementById('questionOptionsContainer'), false);
    if (!imageData) return window.showToast?.(tr('Ajoutez une image à la question.', 'Add an image to the question.'), 'error');

    const container = document.getElementById('questionOptionsContainer');
    const { choices, correct } = collectChoices(container);
    if (!choices.length) return window.showToast?.(tr('Ajoutez au moins une réponse.', 'Add at least one answer.'), 'error');
    if (!currentSession?.code) return window.showToast?.(tr('Quiz non chargé.', 'Quiz not loaded.'), 'error');

    const questions = Array.isArray(currentSession.questions)
      ? [...currentSession.questions]
      : Object.values(currentSession.questions || {});
    questions.push({ type: 'image', text, imageData, options: choices, correct, createdAt: Date.now() });

    try {
      await database.ref(`sessions/${currentSession.code}/questions`).set(questions);
      window.showToast?.(tr('Question avec image ajoutée !', 'Image question added!'));
      window.closeModals?.();
      document.getElementById('addQuestionForm')?.reset();
    } catch (error) {
      console.error('Question image variable :', error);
      window.showToast?.(error?.message || tr('Enregistrement impossible.', 'Unable to save.'), 'error');
    }
  }

  async function updateVariableQuestion(event, question) {
    event.preventDefault();
    const text = document.getElementById('editQuestionText')?.value.trim() || '';
    if (!text) return window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');

    const container = document.getElementById('editQuestionOptionsContainer');
    const { choices, correct } = collectChoices(container);
    if (!choices.length) return window.showToast?.(tr('Ajoutez au moins une réponse.', 'Add at least one answer.'), 'error');

    const updated = { ...question, text, options: choices, correct };
    if (question.type === 'image') {
      const imageData = imageDataFrom(container, true);
      if (!imageData) return window.showToast?.(tr('Ajoutez une image à la question.', 'Add an image to the question.'), 'error');
      updated.imageData = imageData;
    }

    try {
      await database.ref(`sessions/${currentSession.code}/questions/${editingIndex}`).set(updated);
      window.showToast?.(tr('Question mise à jour !', 'Question updated!'));
      window.closeModals?.();
      editingIndex = null;
    } catch (error) {
      console.error('Modification réponses variables :', error);
      window.showToast?.(error?.message || tr('Modification impossible.', 'Unable to update.'), 'error');
    }
  }

  function install() {
    installStyles();

    const previousSelect = window.selectQuestionType;
    const previousSave = window.saveQuestion;
    const previousEdit = window.showEditModal;
    const previousUpdate = window.updateQuestion;

    window.selectQuestionType = type => {
      const result = previousSelect(type);
      if (type === 'mcq' || type === 'image') {
        queueMicrotask(() => ensureControls(document.getElementById('questionOptionsContainer')));
      }
      return result;
    };

    window.saveQuestion = event => {
      const type = document.getElementById('selectedQuestionType')?.value;
      if (type === 'mcq') return saveMcq(event);
      if (type === 'image') return saveImage(event);
      return previousSave(event);
    };

    window.showEditModal = index => {
      editingIndex = index;
      const question = currentSession?.questions?.[index];
      const result = previousEdit(index);
      if (question?.type === 'mcq' || question?.type === 'image') {
        queueMicrotask(() => {
          const container = document.getElementById('editQuestionOptionsContainer');
          ensureControls(container);
          trimToExistingCount(container, question.options?.length || 1);
        });
      }
      return result;
    };

    window.updateQuestion = event => {
      const question = editingIndex !== null ? currentSession?.questions?.[editingIndex] : null;
      if (question?.type === 'mcq' || question?.type === 'image') {
        return updateVariableQuestion(event, question);
      }
      return previousUpdate(event);
    };

    // Le modal s'ouvre par défaut en QCM via showAddQuestionModal().
    // On observe aussi les rendus dynamiques venant du module Image.
    const observer = new MutationObserver(() => {
      const add = document.getElementById('questionOptionsContainer');
      const edit = document.getElementById('editQuestionOptionsContainer');
      if (add?.querySelector('.option-input-row')) ensureControls(add);
      if (edit?.querySelector('.option-input-row')) ensureControls(edit);
    });

    const addModal = document.getElementById('addQuestionModal');
    const editModal = document.getElementById('editQuestionModal');
    if (addModal) observer.observe(addModal, { childList: true, subtree: true });
    if (editModal) observer.observe(editModal, { childList: true, subtree: true });
  }

  window.QuizLiveVariableChoices = { version: VERSION };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
