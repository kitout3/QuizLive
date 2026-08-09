// QuizLive — nombre de choix variable pour QCM et questions Image (v89)
(() => {
  'use strict';

  if (window.QuizLiveVariableChoices?.version === '89') return;

  const LETTERS = ['A', 'B', 'C', 'D'];
  const TYPES = new Set(['mcq', 'image']);

  const tr = (fr, en) => {
    const lang = window.QuizI18n?.getLanguage?.()
      || localStorage.getItem('quizliveLanguage')
      || document.documentElement.lang
      || 'fr';
    return String(lang).toLowerCase().startsWith('en') ? en : fr;
  };

  function installStyles() {
    if (document.getElementById('qlVariableChoiceStyles')) return;
    const style = document.createElement('style');
    style.id = 'qlVariableChoiceStyles';
    style.textContent = `
      .option-input-row{position:relative}
      .ql-choice-remove{
        flex:0 0 34px;width:34px;height:34px;display:grid;place-items:center;
        padding:0;border:1px solid rgba(248,113,113,.30);border-radius:10px;
        background:rgba(239,68,68,.08);color:#fca5a5;font:600 21px/1 Arial,sans-serif;
        cursor:pointer;transition:all .18s ease
      }
      .ql-choice-remove:hover{background:rgba(239,68,68,.18);border-color:rgba(248,113,113,.62);color:#fff;transform:scale(1.04)}
      .ql-choice-remove:disabled{opacity:.26;cursor:not-allowed;transform:none}
      .ql-choice-add-wrap{display:flex;justify-content:flex-end;margin-top:10px}
      .ql-choice-add{
        border:1px dashed rgba(139,92,246,.62);border-radius:11px;
        background:rgba(99,102,241,.08);color:#d9d6ff;padding:9px 14px;
        font:600 .82rem Outfit,sans-serif;cursor:pointer;transition:all .18s ease
      }
      .ql-choice-add:hover{background:rgba(139,92,246,.16);border-color:#a78bfa;color:#fff}
      .ql-choice-count{margin-right:auto;align-self:center;color:var(--text-muted);font-size:.78rem}
      @media(max-width:620px){
        .option-input-row{flex-wrap:wrap}
        .option-input-row input{min-width:calc(100% - 56px)}
        .option-input-row .correct-toggle{margin-left:46px}
      }
    `;
    document.head.appendChild(style);
  }

  function rowsFor(container) {
    return [...(container?.querySelectorAll('.options-creator .option-input-row') || [])];
  }

  function setCorrectButton(button, active) {
    if (!button) return;
    button.classList.toggle('active', active);
    button.textContent = `✓ ${tr('Correcte', 'Correct')}`;
  }

  function normalizeRows(container) {
    if (!container) return;
    const rows = rowsFor(container);
    if (!rows.length) return;

    if (!rows.some(row => row.querySelector('.correct-toggle.active'))) {
      setCorrectButton(rows[0].querySelector('.correct-toggle'), true);
    }

    rows.forEach((row, index) => {
      const letter = LETTERS[index];
      const badge = row.querySelector('.option-color');
      const input = row.querySelector('input[type="text"]');
      const correct = row.querySelector('.correct-toggle');
      let remove = row.querySelector('.ql-choice-remove');

      if (badge) {
        badge.textContent = letter;
        [...badge.classList].forEach(name => {
          if (/^opt-[a-d]$/.test(name)) badge.classList.remove(name);
        });
        badge.classList.add(`opt-${letter.toLowerCase()}`);
      }

      if (input) {
        input.dataset.qlChoice = String(index);
        input.placeholder = `${tr('Option', 'Option')} ${letter}`;
      }

      if (correct) {
        correct.removeAttribute('onclick');
        correct.dataset.qlCorrect = String(index);
        correct.onclick = () => {
          rowsFor(container).forEach(currentRow => {
            setCorrectButton(currentRow.querySelector('.correct-toggle'), false);
          });
          setCorrectButton(correct, true);
        };
      }

      if (!remove) {
        remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ql-choice-remove';
        remove.textContent = '×';
        row.appendChild(remove);
      }

      remove.title = tr(`Supprimer la réponse ${letter}`, `Remove answer ${letter}`);
      remove.setAttribute('aria-label', remove.title);
      remove.disabled = rows.length <= 1;
      remove.onclick = () => {
        const currentRows = rowsFor(container);
        if (currentRows.length <= 1) return;
        const removedWasCorrect = row.querySelector('.correct-toggle')?.classList.contains('active');
        row.remove();
        const remaining = rowsFor(container);
        if (removedWasCorrect && remaining.length) {
          remaining.forEach(currentRow => setCorrectButton(currentRow.querySelector('.correct-toggle'), false));
          setCorrectButton(remaining[0].querySelector('.correct-toggle'), true);
        }
        normalizeRows(container);
      };
    });

    renderAddControl(container);
  }

  function createChoiceRow(container) {
    const creator = container?.querySelector('.options-creator');
    if (!creator) return;
    const count = rowsFor(container).length;
    if (count >= 4) return;

    const row = document.createElement('div');
    row.className = 'option-input-row';
    row.innerHTML = `
      <div class="option-color opt-${LETTERS[count].toLowerCase()}">${LETTERS[count]}</div>
      <input type="text" class="form-group" placeholder="Option ${LETTERS[count]}">
      <button type="button" class="correct-toggle">✓ ${tr('Correcte', 'Correct')}</button>
      <button type="button" class="ql-choice-remove">×</button>
    `;
    creator.appendChild(row);
    normalizeRows(container);
    row.querySelector('input')?.focus();
  }

  function renderAddControl(container) {
    let wrap = container.querySelector('.ql-choice-add-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'ql-choice-add-wrap';
      container.appendChild(wrap);
    }

    const count = rowsFor(container).length;
    wrap.innerHTML = `
      <span class="ql-choice-count">${count} ${count > 1 ? tr('choix', 'choices') : tr('choix', 'choice')}</span>
      ${count < 4 ? `<button type="button" class="ql-choice-add">+ ${tr('Ajouter un choix', 'Add a choice')}</button>` : ''}
    `;
    wrap.querySelector('.ql-choice-add')?.addEventListener('click', () => createChoiceRow(container));
  }

  function decorate(container, expectedCount = null) {
    if (!container) return;
    let rows = rowsFor(container);

    if (Number.isInteger(expectedCount) && expectedCount >= 1 && expectedCount <= 4 && rows.length > expectedCount) {
      rows.slice(expectedCount).forEach(row => row.remove());
    }

    normalizeRows(container);
  }

  function getAnswers(container) {
    const rows = rowsFor(container);
    if (!rows.length) return null;

    const answers = rows.map(row => row.querySelector('input[type="text"]')?.value.trim() || '');
    if (answers.some(answer => !answer)) return null;

    let correct = rows.findIndex(row => row.querySelector('.correct-toggle')?.classList.contains('active'));
    if (correct < 0) correct = 0;
    return { answers, correct };
  }

  async function saveChoiceQuestion(event, type) {
    event.preventDefault();

    const text = document.getElementById('questionText')?.value.trim() || '';
    if (!text) {
      window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');
      return;
    }

    const container = document.getElementById('questionOptionsContainer');
    const choiceData = getAnswers(container);
    if (!choiceData) {
      window.showToast?.(tr('Remplissez chaque réponse affichée ou supprimez-la avec la croix.', 'Fill every visible answer or remove it with the cross.'), 'error');
      return;
    }

    if (!currentSession?.code) {
      window.showToast?.(tr('Quiz non chargé.', 'Quiz not loaded.'), 'error');
      return;
    }

    const question = {
      type,
      text,
      options: choiceData.answers,
      correct: choiceData.correct,
      createdAt: Date.now()
    };

    if (type === 'image') {
      const image = document.querySelector('#questionImagePreview img');
      if (!image?.src) {
        window.showToast?.(tr('Ajoutez une image à la question.', 'Add an image to the question.'), 'error');
        return;
      }
      question.imageData = image.src;
    }

    const questions = Array.isArray(currentSession.questions)
      ? [...currentSession.questions]
      : Object.values(currentSession.questions || {});
    questions.push(question);

    try {
      await database.ref(`sessions/${currentSession.code}/questions`).set(questions);
      window.showToast?.(tr('Question ajoutée !', 'Question added!'));
      window.closeModals?.();
      document.getElementById('addQuestionForm')?.reset();
    } catch (error) {
      console.error('Enregistrement question à choix variable :', error);
      window.showToast?.(error?.message || tr('Enregistrement impossible.', 'Unable to save.'), 'error');
    }
  }

  async function updateChoiceQuestion(event, type) {
    event.preventDefault();

    if (editingQuestionIndex === null || editingQuestionIndex === undefined) return;
    const question = currentSession?.questions?.[editingQuestionIndex];
    if (!question) return;

    const text = document.getElementById('editQuestionText')?.value.trim() || '';
    if (!text) {
      window.showToast?.(tr('Entrez le texte de la question', 'Enter the question text'), 'error');
      return;
    }

    const container = document.getElementById('editQuestionOptionsContainer');
    const choiceData = getAnswers(container);
    if (!choiceData) {
      window.showToast?.(tr('Remplissez chaque réponse affichée ou supprimez-la avec la croix.', 'Fill every visible answer or remove it with the cross.'), 'error');
      return;
    }

    const updated = {
      ...question,
      type,
      text,
      options: choiceData.answers,
      correct: choiceData.correct
    };

    if (type === 'image') {
      const image = document.querySelector('#editquestionImagePreview img');
      if (!image?.src) {
        window.showToast?.(tr('Ajoutez une image à la question.', 'Add an image to the question.'), 'error');
        return;
      }
      updated.imageData = image.src;
    }

    try {
      await database.ref(`sessions/${currentSession.code}/questions/${editingQuestionIndex}`).set(updated);
      window.showToast?.(tr('Question mise à jour !', 'Question updated!'));
      window.closeModals?.();
      editingQuestionIndex = null;
    } catch (error) {
      console.error('Modification question à choix variable :', error);
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
      if (TYPES.has(type)) {
        requestAnimationFrame(() => decorate(document.getElementById('questionOptionsContainer')));
      }
      return result;
    };

    window.saveQuestion = event => {
      const type = document.getElementById('selectedQuestionType')?.value;
      if (TYPES.has(type)) return saveChoiceQuestion(event, type);
      return previousSave(event);
    };

    window.showEditModal = index => {
      const question = currentSession?.questions?.[index];
      const result = previousEdit(index);
      if (TYPES.has(question?.type)) {
        requestAnimationFrame(() => decorate(
          document.getElementById('editQuestionOptionsContainer'),
          Math.max(1, Math.min(4, question.options?.length || 1))
        ));
      }
      return result;
    };

    window.updateQuestion = event => {
      const question = editingQuestionIndex !== null && editingQuestionIndex !== undefined
        ? currentSession?.questions?.[editingQuestionIndex]
        : null;
      if (TYPES.has(question?.type)) return updateChoiceQuestion(event, question.type);
      return previousUpdate(event);
    };

    document.addEventListener('quizlive:languagechange', () => {
      normalizeRows(document.getElementById('questionOptionsContainer'));
      normalizeRows(document.getElementById('editQuestionOptionsContainer'));
    });
  }

  window.QuizLiveVariableChoices = { version: '89', decorate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
