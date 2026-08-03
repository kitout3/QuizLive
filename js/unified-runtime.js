// QuizLive - flux unifiés et correctifs de stabilité
(() => {
  'use strict';

  const normalizePseudo = value => String(value || '')
    .trim().toLocaleLowerCase('fr-FR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 _-]/g, '')
    .replace(/\s+/g, ' ').slice(0, 30);

  function toast(message, type = 'success') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else alert(message);
  }

  // ---------- GOOGLE : un seul flux, uniquement par redirection ----------
  async function googleRedirect(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    try {
      sessionStorage.setItem('quizliveGoogleReturn', '1');
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await firebase.auth().signInWithRedirect(provider);
    } catch (error) {
      console.error('Google redirect error', error);
      toast(error?.message || 'Connexion Google impossible', 'error');
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#roleGoogleBtn, #orgGoogleBtn, [data-google-auth]');
    if (button) googleRedirect(event);
  }, true);

  firebase.auth().getRedirectResult().then(async result => {
    const user = result?.user || firebase.auth().currentUser;
    if (!sessionStorage.getItem('quizliveGoogleReturn') || !user || user.isAnonymous) return;
    sessionStorage.removeItem('quizliveGoogleReturn');
    if (window.QuizOrganizer?.saveOrganizerProfile) {
      await window.QuizOrganizer.saveOrganizerProfile(user, user.displayName);
    }
    localStorage.setItem('organizerUid', user.uid);
    toast('Connexion Google réussie');
    if (location.pathname.endsWith('/index.html') || location.pathname.endsWith('/QuizLive/')) location.reload();
  }).catch(error => {
    sessionStorage.removeItem('quizliveGoogleReturn');
    console.error('Google redirect result error', error);
    toast(error?.message || 'Connexion Google impossible', 'error');
  });

  // Neutralise les anciennes API popup encore appelées par les modules historiques.
  if (window.QuizOrganizer) {
    window.QuizOrganizer.signInWithGoogle = () => googleRedirect();
  }

  // ---------- PARTICIPANT : authentification, session, pseudo atomique ----------
  async function joinParticipant(event) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    const code = String(document.getElementById('sessionCode')?.value || '').trim().toUpperCase();
    const name = String(document.getElementById('playerName')?.value || '').trim().slice(0, 30).replace(/[<>"'&]/g, '');
    if (!/^[A-Z0-9]{6}$/.test(code) || !name) {
      toast('Code à 6 caractères et pseudo requis', 'error');
      return false;
    }
    const submit = event?.submitter || document.querySelector('#joinModal button[type="submit"]');
    if (submit?.disabled) return false;
    if (submit) { submit.disabled = true; submit.dataset.oldText = submit.textContent; submit.textContent = 'Connexion…'; }
    let pseudoRef;
    try {
      if (firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous) await firebase.auth().signOut();
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
      let user = firebase.auth().currentUser;
      if (!user?.isAnonymous) user = (await firebase.auth().signInAnonymously()).user;

      const sessionSnap = await database.ref(`sessions/${code}`).once('value');
      if (!sessionSnap.exists()) throw new Error('Session introuvable');

      const key = normalizePseudo(name);
      if (!key) throw new Error('Pseudo invalide');
      pseudoRef = database.ref(`sessionPseudos/${code}/${key}`);
      const tx = await pseudoRef.transaction(current => current || {
        uid: user.uid, name, createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      if (!tx.committed || tx.snapshot.val()?.uid !== user.uid) {
        throw new Error('Ce pseudo est déjà utilisé dans cette partie');
      }

      const participant = { id: user.uid, name, joinedAt: Date.now(), score: 0 };
      await database.ref(`sessions/${code}/participants/${user.uid}`).set(participant);
      const local = { code, isAdmin: false, participantId: user.uid, odparticipantId: user.uid, name };
      sessionStorage.setItem('quizSession', JSON.stringify(local));
      localStorage.setItem('quizSession', JSON.stringify(local));
      location.href = `play.html?code=${encodeURIComponent(code)}`;
      return false;
    } catch (error) {
      console.error('Participant join error', error);
      if (pseudoRef && /permission|session introuvable/i.test(String(error?.message))) {
        // ne supprime pas une réservation appartenant à un tiers
      }
      toast(error?.message || 'Connexion participant impossible', 'error');
      return false;
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = submit.dataset.oldText || 'Rejoindre'; }
    }
  }

  window.joinQuiz = joinParticipant;
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form?.closest?.('#joinModal') || form?.querySelector?.('#sessionCode')) joinParticipant(event);
  }, true);

  // ---------- SAUVEGARDE : rangement par organisateur ----------
  window.saveSession = async function saveSessionUnified() {
    try {
      const user = firebase.auth().currentUser;
      if (!user || user.isAnonymous) throw new Error('Connexion organisateur requise');
      const code = new URLSearchParams(location.search).get('code') || window.currentSession?.code;
      if (!code) throw new Error('Session introuvable');
      const snap = await database.ref(`sessions/${code}`).once('value');
      const session = snap.val();
      if (!session || session.ownerUid !== user.uid) throw new Error('Vous ne pouvez sauvegarder que vos propres quiz');
      const saveId = `${Date.now()}-${code}`;
      const payload = {
        id: saveId,
        sourceCode: code,
        name: session.name || `Quiz ${code}`,
        questions: session.questions || [],
        slides: session.slides || [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await database.ref(`savedSessions/${user.uid}/${saveId}`).set(payload);
      toast('Quiz sauvegardé');
      document.getElementById('saveSessionModal')?.classList.remove('active');
    } catch (error) {
      console.error('Save quiz error', error);
      toast(`Erreur de sauvegarde : ${error?.message || 'inconnue'}`, 'error');
    }
  };

  // ---------- APERÇU ET ORDRE DES QUESTIONS/SLIDES ----------
  function getItems() {
    const session = window.currentSession;
    if (!session) return [];
    return Array.isArray(session.questions) ? session.questions : Object.values(session.questions || {});
  }

  function preview(index) {
    const item = getItems()[index];
    const display = document.getElementById('questionDisplay');
    if (!item || !display) return;
    if (item.type === 'slide' || item.imageData || item.imageUrl) {
      const src = item.imageData || item.imageUrl || item.url;
      display.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><img src="${src}" alt="Slide ${index + 1}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:12px"></div>`;
    } else {
      const options = Array.isArray(item.options) ? item.options : Object.values(item.options || {});
      display.innerHTML = `<div style="padding:28px;width:100%"><div style="color:var(--text-muted);margin-bottom:12px">Aperçu ${index + 1}</div><h2>${String(item.text || item.question || 'Question').replace(/[<>]/g,'')}</h2><div style="display:grid;gap:10px;margin-top:24px">${options.map((o,i)=>`<div style="padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px">${i+1}. ${String(o).replace(/[<>]/g,'')}</div>`).join('')}</div></div>`;
    }
  }

  async function moveItem(from, delta) {
    const items = getItems();
    const to = from + delta;
    if (to < 0 || to >= items.length) return;
    [items[from], items[to]] = [items[to], items[from]];
    const code = new URLSearchParams(location.search).get('code');
    await database.ref(`sessions/${code}/questions`).set(items);
    preview(to);
  }

  function enhanceList() {
    const list = document.getElementById('questionList');
    if (!list) return;
    [...list.children].forEach((child, index) => {
      if (child.dataset.previewEnhanced === '1') return;
      child.dataset.previewEnhanced = '1';
      child.style.cursor = 'pointer';
      child.addEventListener('click', event => {
        if (event.target.closest('button')) return;
        preview(index);
      });
      const controls = document.createElement('span');
      controls.style.cssText = 'display:inline-flex;gap:4px;margin-left:8px;float:right';
      controls.innerHTML = `<button type="button" title="Monter" style="padding:2px 7px">↑</button><button type="button" title="Descendre" style="padding:2px 7px">↓</button>`;
      controls.children[0].onclick = e => { e.stopPropagation(); moveItem(index, -1).catch(err => toast(err.message, 'error')); };
      controls.children[1].onclick = e => { e.stopPropagation(); moveItem(index, 1).catch(err => toast(err.message, 'error')); };
      child.appendChild(controls);
    });
  }

  const observer = new MutationObserver(enhanceList);
  window.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('questionList');
    if (list) observer.observe(list, { childList: true, subtree: false });
    enhanceList();
  });
})();
