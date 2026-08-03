// QuizLive - runtime unifié des fonctions critiques
(() => {
  'use strict';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const toast = (message, type = 'success') => typeof window.showToast === 'function' ? window.showToast(message, type) : alert(message);
  const codeFromUrl = () => String(new URLSearchParams(location.search).get('code') || '').trim().toUpperCase();
  const normalizePseudo = value => String(value || '').trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 30);
  const toArray = value => Array.isArray(value) ? value.filter(Boolean) : Object.keys(value || {}).sort((a,b)=>Number(a)-Number(b)).map(key => value[key]);

  async function getAnonymousUser() {
    const current = firebase.auth().currentUser;
    if (current?.isAnonymous) return current;
    if (current && !current.isAnonymous) await firebase.auth().signOut();
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
    return (await firebase.auth().signInAnonymously()).user;
  }

  async function joinParticipant(event, codeInput, nameInput, button) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    const code = String(codeInput?.value || codeFromUrl()).trim().toUpperCase();
    const name = String(nameInput?.value || '').trim().slice(0, 30).replace(/[<>"'&]/g, '');
    if (!/^[A-Z0-9]{6}$/.test(code)) return toast('Code de session invalide', 'error');
    if (!name) return toast('Renseignez votre pseudo', 'error');
    if (button?.disabled) return;
    if (button) {
      button.disabled = true;
      button.dataset.originalLabel = button.textContent;
      button.textContent = 'Connexion…';
    }
    try {
      const user = await getAnonymousUser();
      const sessionSnap = await database.ref(`sessions/${code}`).once('value');
      if (!sessionSnap.exists()) throw new Error('Session introuvable');
      if (sessionSnap.val()?.status === 'ended') throw new Error('Cette session est terminée');
      const normalized = normalizePseudo(name);
      if (!normalized) throw new Error('Pseudo invalide');
      const pseudoRef = database.ref(`sessionPseudos/${code}/${normalized}`);
      const tx = await pseudoRef.transaction(current => {
        if (current && current.uid !== user.uid) return;
        return current || { uid: user.uid, name, createdAt: Date.now() };
      });
      if (!tx.committed || tx.snapshot.val()?.uid !== user.uid) throw new Error('Ce pseudo est déjà utilisé dans cette partie');
      await database.ref(`sessions/${code}/participants/${user.uid}`).set({ id: user.uid, name, joinedAt: Date.now(), score: 0 });
      const local = { code, isAdmin: false, participantId: user.uid, odparticipantId: user.uid, name };
      sessionStorage.setItem('quizSession', JSON.stringify(local));
      localStorage.setItem('quizSession', JSON.stringify(local));
      location.href = `play.html?code=${encodeURIComponent(code)}`;
    } catch (error) {
      const message = error?.code === 'auth/operation-not-allowed'
        ? 'Activez la connexion anonyme dans Firebase Authentication'
        : error?.code === 'PERMISSION_DENIED'
          ? 'Accès refusé par les règles Firebase'
          : error?.message || 'Connexion participant impossible';
      console.error('Connexion participant:', error);
      toast(message, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalLabel || 'Participer';
      }
    }
  }

  window.joinQuiz = event => joinParticipant(
    event,
    document.getElementById('sessionCode'),
    document.getElementById('playerName'),
    event?.submitter || document.querySelector('#joinModal button[type="submit"]')
  );

  window.joinViaQR = event => joinParticipant(
    event,
    document.getElementById('qrSessionCode'),
    document.getElementById('qrPlayerName'),
    event?.submitter || document.querySelector('#joinViaQRForm button[type="submit"]')
  );

  document.addEventListener('submit', event => {
    if (event.target?.id === 'joinViaQRForm') return window.joinViaQR(event);
    if (event.target?.closest?.('#joinModal')) return window.joinQuiz(event);
  }, true);

  if (document.body?.dataset?.page === 'player') {
    const code = codeFromUrl();
    let local = null;
    try { local = JSON.parse(sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession') || 'null'); } catch {}
    if (code && (!local || local.code !== code || local.isAdmin)) {
      const modal = document.getElementById('joinViaQRModal');
      const codeInput = document.getElementById('qrSessionCode');
      if (codeInput) codeInput.value = code;
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
    }
  }

  async function getOwnedSession() {
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
    const code = codeFromUrl();
    if (!code) throw new Error('Session introuvable');
    const snap = await database.ref(`sessions/${code}`).once('value');
    const session = snap.val();
    if (!session || session.ownerUid !== user.uid) throw new Error('Cette session ne vous appartient pas');
    return { user, code, session };
  }

  window.saveSession = async () => {
    try {
      const { user, code, session } = await getOwnedSession();
      const id = `${Date.now()}-${code}`;
      await database.ref(`savedSessions/${user.uid}/${id}`).set({
        id, sourceCode: code, name: session.name || `Quiz ${code}`,
        questions: toArray(session.questions), slides: toArray(session.slides),
        createdAt: Date.now(), updatedAt: Date.now()
      });
      toast('Quiz sauvegardé');
      await renderSavedSessions();
    } catch (error) {
      toast(`Erreur de sauvegarde : ${error.message}`, 'error');
    }
  };

  async function renderSavedSessions() {
    const container = document.getElementById('savedSessionsList');
    if (!container) return;
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
      const snap = await database.ref(`savedSessions/${user.uid}`).once('value');
      const saves = Object.entries(snap.val() || {}).map(([id, value]) => ({ id, ...value })).sort((a,b)=>Number(b.updatedAt||b.createdAt||0)-Number(a.updatedAt||a.createdAt||0));
      container.innerHTML = saves.length ? saves.map(save => {
        const count = toArray(save.questions).length;
        const date = new Date(Number(save.updatedAt || save.createdAt || 0)).toLocaleString('fr-FR');
        return `<div style="padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;margin-bottom:10px">
          <strong>${esc(save.name || 'Quiz sauvegardé')}</strong><br><small>${esc(date)} · ${count} élément(s)</small>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button type="button" class="btn-primary" data-load-save="${esc(save.id)}">Charger</button>
            <button type="button" data-delete-save="${esc(save.id)}">Supprimer</button>
          </div></div>`;
      }).join('') : '<p style="color:var(--text-muted);text-align:center">Aucune sauvegarde</p>';
    } catch (error) {
      container.innerHTML = `<p style="color:#fca5a5;text-align:center">${esc(error.message)}</p>`;
    }
  }

  window.showSaveModal = function() {
    document.getElementById('saveSessionModal')?.classList.add('active');
    renderSavedSessions();
  };

  document.addEventListener('click', async event => {
    const load = event.target.closest('[data-load-save]');
    if (load) {
      try {
        const { user, code } = await getOwnedSession();
        const snap = await database.ref(`savedSessions/${user.uid}/${load.dataset.loadSave}`).once('value');
        if (!snap.exists()) throw new Error('Sauvegarde introuvable');
        const save = snap.val();
        await database.ref(`sessions/${code}`).update({ questions: toArray(save.questions), slides: toArray(save.slides), currentQuestion: -1, status: 'waiting', updatedAt: Date.now() });
        document.getElementById('saveSessionModal')?.classList.remove('active');
        toast('Sauvegarde chargée');
      } catch (error) { toast(`Chargement impossible : ${error.message}`, 'error'); }
    }
    const remove = event.target.closest('[data-delete-save]');
    if (remove) {
      const user = firebase.auth().currentUser;
      if (user && confirm('Supprimer cette sauvegarde ?')) {
        await database.ref(`savedSessions/${user.uid}/${remove.dataset.deleteSave}`).remove();
        await renderSavedSessions();
      }
    }
  });

  async function loadItems() {
    const snap = await database.ref(`sessions/${codeFromUrl()}/questions`).once('value');
    return toArray(snap.val());
  }

  async function preview(index) {
    const item = (await loadItems())[index];
    const display = document.getElementById('questionDisplay');
    if (!item || !display) return;
    const source = item.imageData || item.imageUrl || item.url;
    if (item.type === 'slide' || source) {
      display.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px"><img src="${esc(source)}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:12px"></div>`;
    } else {
      const options = toArray(item.options);
      display.innerHTML = `<div style="padding:28px;width:100%"><small>Aperçu ${index + 1}</small><h2>${esc(item.text || item.question || 'Question')}</h2><div style="display:grid;gap:10px;margin-top:22px">${options.map((option,i)=>`<div style="padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px">${i+1}. ${esc(option)}</div>`).join('')}</div></div>`;
    }
    updateLaunchButton();
  }

  async function move(index, delta) {
    const items = await loadItems();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    await database.ref(`sessions/${codeFromUrl()}/questions`).set(items);
    await preview(target);
  }

  function enhanceList() {
    const list = document.getElementById('questionList');
    if (!list) return;
    [...list.children].forEach((element, index) => {
      if (element.dataset.runtimeEnhanced === '1') return;
      element.dataset.runtimeEnhanced = '1';
      element.style.cursor = 'pointer';
      element.addEventListener('click', event => { if (!event.target.closest('button')) preview(Number(element.dataset.index ?? index)); });
      const controls = document.createElement('span');
      controls.style.cssText = 'display:inline-flex;gap:4px;margin-right:5px';
      controls.innerHTML = '<button type="button">↑</button><button type="button">↓</button>';
      controls.children[0].onclick = event => { event.stopPropagation(); move(Number(element.dataset.index ?? index), -1); };
      controls.children[1].onclick = event => { event.stopPropagation(); move(Number(element.dataset.index ?? index), 1); };
      element.querySelector('.question-actions')?.prepend(controls);
    });
  }

  function updateLaunchButton() {
    if (document.body?.dataset?.page !== 'admin') return;
    let button = document.getElementById('persistentLaunchQuiz');
    if (!button) {
      button = document.createElement('button');
      button.id = 'persistentLaunchQuiz';
      button.className = 'btn-control btn-start';
      button.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:1600;padding:16px 22px;border-radius:16px;box-shadow:0 12px 35px rgba(0,0,0,.45);display:none';
      button.innerHTML = '🚀 Lancer le Quiz';
      button.onclick = () => typeof window.startQuiz === 'function' ? window.startQuiz() : toast('Fonction de lancement indisponible', 'error');
      document.body.appendChild(button);
    }
    const session = window.currentSession;
    const count = toArray(session?.questions).length;
    button.style.display = session?.status === 'waiting' && count > 0 ? 'block' : 'none';
  }

  const list = document.getElementById('questionList');
  if (list) new MutationObserver(() => { enhanceList(); updateLaunchButton(); }).observe(list, { childList: true });
  const display = document.getElementById('questionDisplay');
  if (display) new MutationObserver(updateLaunchButton).observe(display, { childList: true, subtree: true });
  setInterval(updateLaunchButton, 700);
  enhanceList();
  updateLaunchButton();
})();