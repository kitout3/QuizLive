(() => {
  'use strict';

  const content = document.getElementById('dashboardContent');
  const auth = window.QuizLiveFirebase?.organizerAuth || firebase.auth();
  let enhancing = false;
  let queued = false;

  if (!content) return;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function notify(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    const notice = document.createElement('div');
    notice.className = `dashboard-notice ${type}`;
    notice.textContent = message;
    content.prepend(notice);
    setTimeout(() => notice.remove(), 3500);
  }

  function codeFromLink(link) {
    try {
      return new URL(link.href, location.href).searchParams.get('code') || '';
    } catch (_) {
      return '';
    }
  }

  function refreshQuizzes() {
    const button = document.querySelector('[data-section="quizzes"]');
    if (button) button.click();
    else location.reload();
  }

  function makeActionsContainer(row, openLink) {
    let actions = row.querySelector('.quiz-row-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'quiz-row-actions';
      row.appendChild(actions);
    }

    openLink.classList.add('quiz-action-button', 'quiz-action-open');
    actions.appendChild(openLink);
    return actions;
  }

  async function enhanceSharedCard(context, sessions) {
    const card = Array.from(content.querySelectorAll('.dashboard-card')).find(item =>
      item.querySelector('h2')?.textContent.trim() === 'Quiz partagés dans mes groupes'
    );
    if (!card) return;

    card.classList.add('quiz-list-card');
    const byCode = new Map(sessions.map(session => [session.code, session]));

    card.querySelectorAll('.dashboard-row').forEach(row => {
      const openLink = row.querySelector('a[href*="admin.html?code="]');
      if (!openLink || row.dataset.quizActionsReady === '1') return;

      const code = codeFromLink(openLink);
      const session = byCode.get(code);
      if (!code || !session) return;

      row.dataset.quizActionsReady = '1';
      row.classList.add('quiz-list-row');
      row.firstElementChild?.classList.add('quiz-row-info');

      const actions = makeActionsContainer(row, openLink);
      if (!context.isOwner) return;

      const select = document.createElement('select');
      select.className = 'quiz-group-select';
      select.setAttribute('aria-label', `Groupe du quiz ${session.name || code}`);
      select.innerHTML = context.groups.map(group =>
        `<option value="${esc(group.id)}" ${group.id === session.groupId ? 'selected' : ''}>${esc(group.name || 'Groupe')}</option>`
      ).join('');

      const moveButton = document.createElement('button');
      moveButton.type = 'button';
      moveButton.className = 'quiz-action-button quiz-action-secondary';
      moveButton.textContent = 'Changer';
      moveButton.onclick = async () => {
        if (!select.value || select.value === session.groupId) {
          notify('Ce quiz est déjà dans ce groupe.', 'error');
          return;
        }

        moveButton.disabled = true;
        select.disabled = true;
        try {
          await window.QuizLiveGroups.assignSession(code, select.value);
          notify('Affectation du quiz mise à jour.');
          refreshQuizzes();
        } catch (error) {
          notify(error.message || 'Changement de groupe impossible.', 'error');
        } finally {
          moveButton.disabled = false;
          select.disabled = false;
        }
      };

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'quiz-action-button quiz-action-danger';
      deleteButton.textContent = 'Supprimer';
      deleteButton.onclick = async () => {
        const quizName = session.name || code;
        if (!confirm(`Supprimer définitivement le quiz « ${quizName} » ?\n\nCette action supprimera aussi les participants, réponses et résultats associés.`)) {
          return;
        }

        deleteButton.disabled = true;
        try {
          await window.QuizLiveGroups.deleteSession(code);
          notify('Quiz supprimé.');
          refreshQuizzes();
        } catch (error) {
          notify(error.message || 'Suppression impossible.', 'error');
        } finally {
          deleteButton.disabled = false;
        }
      };

      actions.prepend(select, moveButton);
      actions.appendChild(deleteButton);
    });
  }

  function enhancePersonalCard() {
    const card = Array.from(content.querySelectorAll('.dashboard-card')).find(item =>
      item.querySelector('h2')?.textContent.trim() === 'Mes quiz personnels'
    );
    if (!card) return;

    card.classList.add('quiz-list-card');
    card.querySelectorAll('.dashboard-row').forEach(row => {
      const openLink = row.querySelector('a[href*="admin.html?code="]');
      if (!openLink || row.dataset.quizPersonalReady === '1') return;

      const code = codeFromLink(openLink);
      if (!code) return;

      row.dataset.quizPersonalReady = '1';
      row.classList.add('quiz-list-row');
      row.firstElementChild?.classList.add('quiz-row-info');
      const actions = makeActionsContainer(row, openLink);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'quiz-action-button quiz-action-danger';
      deleteButton.textContent = 'Supprimer';
      deleteButton.onclick = async () => {
        const name = row.querySelector('strong')?.textContent || code;
        if (!confirm(`Supprimer définitivement le quiz « ${name} » ?`)) return;

        deleteButton.disabled = true;
        try {
          await window.QuizLiveGroups.deleteSession(code);
          notify('Quiz supprimé.');
          refreshQuizzes();
        } catch (error) {
          notify(error.message || 'Suppression impossible.', 'error');
        } finally {
          deleteButton.disabled = false;
        }
      };
      actions.appendChild(deleteButton);
    });
  }

  async function enhance() {
    if (enhancing) {
      queued = true;
      return;
    }

    const title = document.getElementById('dashboardTitle');
    if (title?.textContent.trim() !== 'Mes quiz') return;
    if (typeof window.QuizLiveGroups?.loadSharedSessions !== 'function') return;

    enhancing = true;
    try {
      const result = await window.QuizLiveGroups.loadSharedSessions();
      await enhanceSharedCard(result.context, result.sessions);
      enhancePersonalCard();

      content.querySelectorAll('.dashboard-card > .dashboard-row:first-child').forEach(row => {
        row.classList.add('quiz-card-header');
      });
      document.getElementById('groupAssignmentCard')?.classList.add('quiz-list-card');
    } catch (error) {
      console.warn('Contrôles des quiz indisponibles :', error);
    } finally {
      enhancing = false;
      if (queued) {
        queued = false;
        setTimeout(enhance, 50);
      }
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(enhance, 40);
  });

  observer.observe(content, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-section="quizzes"]')) setTimeout(enhance, 120);
  });
  auth.onAuthStateChanged(user => {
    if (user && !user.isAnonymous) setTimeout(enhance, 100);
  });
})();
