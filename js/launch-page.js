(() => {
  'use strict';

  const code = (new URLSearchParams(location.search).get('code') || '').trim().toUpperCase();
  const $ = id => document.getElementById(id);
  const toArray = value => Array.isArray(value) ? value.filter(Boolean) : Object.keys(value || {}).sort((a,b)=>Number(a)-Number(b)).map(key=>value[key]).filter(Boolean);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let user = null;
  let session = null;
  let items = [];
  let previewIndex = 0;
  let participantRef = null;

  function isSlide(item){ return item?.type === 'slide' || item?.image || item?.imageUrl || item?.slideUrl || item?.imageData; }
  function imageSource(item){ return item?.image || item?.imageUrl || item?.slideUrl || item?.imageData || ''; }
  function participantLabel(count){ return `${count} participant${count > 1 ? 's' : ''}`; }

  function buildJoinUrl(){
    const url = new URL('player.html', location.href);
    url.searchParams.set('code', code);
    return url.href;
  }

  function renderQr(){
    const joinUrl = buildJoinUrl();
    $('joinLink').href = joinUrl;
    $('joinLink').textContent = joinUrl;
    $('launchQr').innerHTML = '';
    new QRCode($('launchQr'), { text: joinUrl, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.M });
  }

  function renderPreview(){
    const total = items.length;
    if (!total) {
      $('previewTitle').textContent = 'Quiz vide';
      $('previewPosition').textContent = '0 / 0';
      $('launchPreview').innerHTML = '<p>Ajoutez des questions ou des slides avant de lancer le quiz.</p>';
      return;
    }
    previewIndex = Math.max(0, Math.min(previewIndex, total - 1));
    const item = items[previewIndex];
    $('previewPosition').textContent = `${previewIndex + 1} / ${total}`;
    $('previewTitle').textContent = isSlide(item) ? (item.title || `Slide ${previewIndex + 1}`) : (item.text || `Question ${previewIndex + 1}`);
    if (isSlide(item)) {
      const src = imageSource(item);
      $('launchPreview').innerHTML = src ? `<img src="${esc(src)}" alt="Aperçu de la slide ${previewIndex + 1}">` : '<p>Cette slide ne contient pas d’image.</p>';
    } else {
      const options = toArray(item.options);
      $('launchPreview').innerHTML = `<div class="launch-question"><p class="launch-eyebrow">${item.type === 'truefalse' ? 'Vrai / Faux' : item.type === 'wordcloud' ? 'Nuage de mots' : 'Question'}</p><h3>${esc(item.text || '')}</h3>${options.length ? `<div class="launch-options">${options.slice(0,4).map(option=>`<div>${esc(typeof option === 'object' ? option.text : option)}</div>`).join('')}</div>` : ''}</div>`;
    }
  }

  function renderParticipants(data){
    const participants = Object.values(data || {});
    const count = participants.length;
    $('participantCount').textContent = count;
    $('stickyParticipants').textContent = participantLabel(count);
    $('participantNames').innerHTML = count ? participants.slice(0,40).map(p=>`<span>${esc(p.name || p.pseudo || 'Participant')}</span>`).join('') : '<span>En attente des participants…</span>';
  }

  async function startQuiz(){
    if (!session || !items.length) {
      alert('Ajoutez au moins une question ou une slide avant de commencer.');
      return;
    }
    const buttons = [$('startQuizTop'), $('startQuizSticky')];
    buttons.forEach(button => { button.disabled = true; button.textContent = 'Démarrage…'; });
    try {
      await database.ref(`sessions/${code}`).update({ status:'active', currentQuestion:0, startedAt:firebase.database.ServerValue.TIMESTAMP, updatedAt:firebase.database.ServerValue.TIMESTAMP });
      location.assign(`admin.html?code=${encodeURIComponent(code)}&started=1`);
    } catch (error) {
      console.error(error);
      alert('Impossible de lancer le quiz. Vérifiez votre connexion et les règles Firebase.');
      buttons.forEach(button => { button.disabled = false; button.textContent = '▶ Commencer le quiz'; });
    }
  }

  async function load(){
    if (!code) throw new Error('Code de session manquant.');
    const snap = await database.ref(`sessions/${code}`).once('value');
    session = snap.val();
    if (!session || session.ownerUid !== user.uid) throw new Error('Session introuvable ou accès refusé.');
    items = toArray(session.questions);
    $('launchQuizName').textContent = session.name || 'Quiz sans titre';
    $('launchCode').textContent = code;
    $('stickyCode').textContent = code;
    $('editQuizLink').href = `editor.html?code=${encodeURIComponent(code)}`;
    renderQr();
    renderPreview();
    participantRef = database.ref(`sessions/${code}/participants`);
    participantRef.on('value', snap => renderParticipants(snap.val()));
  }

  $('previousPreview').onclick = () => { if (items.length) { previewIndex = (previewIndex - 1 + items.length) % items.length; renderPreview(); } };
  $('nextPreview').onclick = () => { if (items.length) { previewIndex = (previewIndex + 1) % items.length; renderPreview(); } };
  $('copyJoinLink').onclick = async () => {
    try { await navigator.clipboard.writeText(buildJoinUrl()); $('copyJoinLink').textContent = 'Lien copié'; setTimeout(()=> $('copyJoinLink').textContent = 'Copier le lien', 1800); }
    catch { prompt('Copiez ce lien :', buildJoinUrl()); }
  };
  $('startQuizTop').onclick = startQuiz;
  $('startQuizSticky').onclick = startQuiz;

  firebase.auth().onAuthStateChanged(async currentUser => {
    if (!currentUser || currentUser.isAnonymous) {
      location.replace(`login.html?return=${encodeURIComponent(`launch.html?code=${code}`)}`);
      return;
    }
    user = currentUser;
    try { await load(); }
    catch (error) { console.error(error); document.querySelector('.launch-shell').innerHTML = `<div style="max-width:700px;margin:60px auto;padding:30px;text-align:center"><h1>Impossible d’ouvrir la session</h1><p>${esc(error.message)}</p><a class="btn-primary" href="dashboard.html?section=quizzes">Retour à mes quiz</a></div>`; }
  });

  window.addEventListener('beforeunload', () => participantRef?.off());
})();