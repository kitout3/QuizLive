// QuizLive - flux unifiés de stabilité
(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const toast = (message, type = 'success') => typeof window.showToast === 'function'
    ? window.showToast(message, type)
    : alert(message);
  const codeFromUrl = () => new URLSearchParams(location.search).get('code');
  const normalizePseudo = value => String(value || '')
    .trim().toLocaleLowerCase('fr-FR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 _-]/g, '')
    .replace(/\s+/g, ' ').slice(0, 30);
  const toArray = value => Array.isArray(value)
    ? value.filter(item => item != null)
    : Object.keys(value || {}).sort((a, b) => Number(a) - Number(b)).map(key => value[key]);

  // Google : tous les boutons déclenchent uniquement une redirection Firebase.
  document.addEventListener('click', event => {
    const button = event.target.closest('#roleGoogleBtn,#orgGoogleBtn,[data-google-auth]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.QuizOrganizer?.signInWithGoogle?.().catch(error => {
      console.error('Google auth:', error);
      toast(window.QuizOrganizer?.authMessage?.(error) || error.message || 'Connexion Google impossible', 'error');
    });
  }, true);

  // Participant : inscription anonyme, session vérifiée et pseudo réservé atomiquement.
  let joinBusy = false;
  async function joinParticipant(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    if (joinBusy) return false;

    const code = String(document.getElementById('sessionCode')?.value || '').trim().toUpperCase();
    const name = String(document.getElementById('playerName')?.value || '')
      .trim().slice(0, 30).replace(/[<>"'&]/g, '');

    if (!/^[A-Z0-9]{6}$/.test(code)) {
      toast('Le code doit contenir exactement 6 lettres ou chiffres', 'error');
      return false;
    }
    if (!name) {
      toast('Renseignez un pseudo', 'error');
      return false;
    }

    const button = event?.submitter || document.querySelector('#joinModal button[type="submit"]');
    joinBusy = true;
    if (button) {
      button.disabled = true;
      button.dataset.oldLabel = button.textContent;
      button.textContent = 'Vérification…';
    }

    try {
      // Le participant utilise l'authentification anonyme attendue par les règles Firebase.
      const current = firebase.auth().currentUser;
      if (current && !current.isAnonymous) await firebase.auth().signOut();
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
      let user = firebase.auth().currentUser;
      if (!user?.isAnonymous) user = (await firebase.auth().signInAnonymously()).user;
      if (!user) throw new Error('Authentification anonyme impossible');

      const sessionSnap = await database.ref(`sessions/${code}`).once('value');
      if (!sessionSnap.exists()) throw new Error('Aucune session active ne correspond à ce code');
      if (sessionSnap.val()?.status === 'ended') throw new Error('Cette session est terminée');

      const pseudoKey = normalizePseudo(name);
      if (!pseudoKey) throw new Error('Pseudo invalide');
      const pseudoRef = database.ref(`sessionPseudos/${code}/${pseudoKey}`);
      const reservation = await pseudoRef.transaction(currentValue => {
        if (currentValue && currentValue.uid !== user.uid) return;
        return { uid: user.uid, name, createdAt: Date.now() };
      });
      if (!reservation.committed || reservation.snapshot.val()?.uid !== user.uid) {
        throw new Error('Ce pseudo est déjà utilisé dans cette partie');
      }

      await database.ref(`sessions/${code}/participants/${user.uid}`).set({
        id: user.uid,
        name,
        joinedAt: Date.now(),
        score: 0
      });

      const localSession = {
        code,
        isAdmin: false,
        participantId: user.uid,
        odparticipantId: user.uid,
        name
      };
      sessionStorage.setItem('quizSession', JSON.stringify(localSession));
      localStorage.setItem('quizSession', JSON.stringify(localSession));
      location.assign(`play.html?code=${encodeURIComponent(code)}`);
    } catch (error) {
      console.error('Participant join:', error);
      const message = error?.code === 'PERMISSION_DENIED'
        ? 'Accès Firebase refusé. Vérifiez les règles sessionPseudos et participants.'
        : error?.code === 'auth/operation-not-allowed'
          ? 'Activez la connexion anonyme dans Firebase Authentication.'
          : error?.message || 'Connexion participant impossible';
      toast(message, 'error');
    } finally {
      joinBusy = false;
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldLabel || 'Rejoindre';
      }
    }
    return false;
  }

  window.joinQuiz = joinParticipant;
  document.addEventListener('submit', event => {
    if (event.target.closest('#joinModal')) joinParticipant(event);
  }, true);

  // Sauvegarde d'un quiz dans le compte organisateur connecté.
  window.saveSession = async function saveCurrentQuiz() {
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
      const code = codeFromUrl();
      if (!code) throw new Error('Session introuvable');
      const snap = await database.ref(`sessions/${code}`).once('value');
      const session = snap.val();
      if (!session || session.ownerUid !== user.uid) throw new Error('Cette session ne vous appartient pas');

      const id = `${Date.now()}-${code}`;
      await database.ref(`savedSessions/${user.uid}/${id}`).set({
        id,
        sourceCode: code,
        name: session.name || `Quiz ${code}`,
        questions: toArray(session.questions),
        slides: toArray(session.slides),
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      toast('Quiz sauvegardé');
      await renderSavedSessions();
    } catch (error) {
      console.error('Save quiz:', error);
      toast(`Erreur de sauvegarde : ${error.message}`, 'error');
    }
  };

  async function getSavedSessions() {
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
    const snap = await database.ref(`savedSessions/${user.uid}`).once('value');
    return Object.entries(snap.val() || {})
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  }

  async function loadSavedQuiz(saveId) {
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
      const code = codeFromUrl();
      if (!code) throw new Error('Session actuelle introuvable');

      const [savedSnap, sessionSnap] = await Promise.all([
        database.ref(`savedSessions/${user.uid}/${saveId}`).once('value'),
        database.ref(`sessions/${code}`).once('value')
      ]);
      const saved = savedSnap.val();
      const session = sessionSnap.val();
      if (!saved) throw new Error('Sauvegarde introuvable');
      if (!session || session.ownerUid !== user.uid) throw new Error('Cette session ne vous appartient pas');

      await database.ref(`sessions/${code}`).update({
        questions: toArray(saved.questions),
        slides: toArray(saved.slides),
        currentQuestion: -1,
        currentQuestionStartedAt: null,
        updatedAt: Date.now()
      });
      document.getElementById('saveSessionModal')?.classList.remove('active');
      toast(`Quiz « ${saved.name || 'Sans titre'} » chargé`);
    } catch (error) {
      console.error('Load saved quiz:', error);
      toast(`Impossible de charger : ${error.message}`, 'error');
    }
  }

  async function deleteSavedQuiz(saveId) {
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
      await database.ref(`savedSessions/${user.uid}/${saveId}`).remove();
      toast('Sauvegarde supprimée');
      await renderSavedSessions();
    } catch (error) {
      toast(`Suppression impossible : ${error.message}`, 'error');
    }
  }

  async function renderSavedSessions() {
    const container = document.getElementById('savedSessionsList');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted);text-align:center">Chargement…</p>';
    try {
      const saves = await getSavedSessions();
      if (!saves.length) {
        container.innerHTML = '<p style="color:var(--text-muted);text-align:center">Aucun quiz sauvegardé pour ce compte</p>';
        return;
      }
      container.innerHTML = saves.map(save => {
        const date = new Date(Number(save.updatedAt || save.createdAt || 0)).toLocaleString('fr-FR');
        const questionCount = toArray(save.questions).length;
        const slideCount = toArray(save.slides).length;
        return `<div class="saved-session-row" data-save-id="${esc(save.id)}" style="padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;margin-bottom:10px">
          <div style="margin-bottom:9px"><strong>${esc(save.name || 'Quiz sans titre')}</strong><br><small>${esc(date)} · ${questionCount} question(s) · ${slideCount} slide(s)</small></div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn-primary saved-load-btn" style="flex:1">Charger</button>
            <button type="button" class="saved-delete-btn" style="padding:8px 12px;border-radius:8px">Supprimer</button>
          </div>
        </div>`;
      }).join('');
      container.querySelectorAll('.saved-session-row').forEach(row => {
        const id = row.dataset.saveId;
        row.querySelector('.saved-load-btn').onclick = () => loadSavedQuiz(id);
        row.querySelector('.saved-delete-btn').onclick = () => {
          if (confirm('Supprimer définitivement cette sauvegarde ?')) deleteSavedQuiz(id);
        };
      });
    } catch (error) {
      container.innerHTML = `<p style="color:#fca5a5;text-align:center">${esc(error.message)}</p>`;
    }
  }

  const legacyShowSaveModal = window.showSaveModal;
  window.showSaveModal = function showSaveModalUnified() {
    if (typeof legacyShowSaveModal === 'function') legacyShowSaveModal();
    else document.getElementById('saveSessionModal')?.classList.add('active');
    renderSavedSessions();
  };
  window.loadSavedSession = loadSavedQuiz;
  window.loadSession = loadSavedQuiz;
  window.deleteSavedSession = deleteSavedQuiz;

  // Aperçu et ordre des questions/slides présentes dans la liste principale.
  async function loadQuestionItems() {
    const code = codeFromUrl();
    if (!code) return [];
    const snap = await database.ref(`sessions/${code}/questions`).once('value');
    return toArray(snap.val());
  }

  async function preview(index) {
    const item = (await loadQuestionItems())[index];
    const display = document.getElementById('questionDisplay');
    if (!item || !display) return;
    const source = item.imageData || item.imageUrl || item.url;
    if (item.type === 'slide' || source) {
      display.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px"><img src="${esc(source)}" alt="Aperçu slide" style="display:block;max-width:100%;max-height:70vh;width:auto;height:auto;object-fit:contain;border-radius:12px"></div>`;
      return;
    }
    const options = toArray(item.options);
    display.innerHTML = `<div style="padding:28px;width:100%"><small style="color:var(--text-muted)">Aperçu ${index + 1}</small><h2>${esc(item.text || item.question || 'Question')}</h2><div style="display:grid;gap:10px;margin-top:22px">${options.map((option, i) => `<div style="padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px">${i + 1}. ${esc(option)}</div>`).join('')}</div></div>`;
  }

  async function moveItem(index, delta) {
    const items = await loadQuestionItems();
    const destination = index + delta;
    if (destination < 0 || destination >= items.length) return;
    [items[index], items[destination]] = [items[destination], items[index]];
    await database.ref(`sessions/${codeFromUrl()}/questions`).set(items);
    await preview(destination);
  }

  function enhanceQuestionList() {
    const list = document.getElementById('questionList');
    if (!list) return;
    [...list.children].forEach((element, index) => {
      if (element.dataset.previewEnhanced === '1') return;
      element.dataset.previewEnhanced = '1';
      element.style.cursor = 'pointer';
      element.addEventListener('click', event => {
        if (!event.target.closest('button')) preview(index).catch(error => toast(error.message, 'error'));
      });
      const controls = document.createElement('span');
      controls.style.cssText = 'float:right;display:inline-flex;gap:4px;margin-left:6px';
      controls.innerHTML = '<button type="button" title="Monter">↑</button><button type="button" title="Descendre">↓</button>';
      controls.children[0].onclick = event => {
        event.stopPropagation();
        moveItem(index, -1).catch(error => toast(error.message, 'error'));
      };
      controls.children[1].onclick = event => {
        event.stopPropagation();
        moveItem(index, 1).catch(error => toast(error.message, 'error'));
      };
      element.appendChild(controls);
    });
  }

  const list = document.getElementById('questionList');
  if (list) new MutationObserver(enhanceQuestionList).observe(list, { childList: true });
  enhanceQuestionList();
})();
