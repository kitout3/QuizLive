// QuizLive - flux unifiés de stabilité
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (m,t='success') => typeof window.showToast === 'function' ? window.showToast(m,t) : alert(m);
  const codeFromUrl = () => new URLSearchParams(location.search).get('code');
  const normalizePseudo = v => String(v||'').trim().toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 _-]/g,'').replace(/\s+/g,' ').slice(0,30);

  // Google : capture prioritaire et redirection uniquement.
  async function googleRedirect(e) {
    e?.preventDefault?.(); e?.stopPropagation?.(); e?.stopImmediatePropagation?.();
    try {
      sessionStorage.setItem('quizliveGoogleReturn','1');
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({prompt:'select_account'});
      await firebase.auth().signInWithRedirect(provider);
    } catch (err) { console.error(err); toast(err.message || 'Connexion Google impossible','error'); }
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#roleGoogleBtn,#orgGoogleBtn,[data-google-auth]')) googleRedirect(e);
  }, true);
  firebase.auth().getRedirectResult().then(async result => {
    const user = result?.user;
    if (!user) return;
    sessionStorage.removeItem('quizliveGoogleReturn');
    if (window.QuizOrganizer?.saveOrganizerProfile) await window.QuizOrganizer.saveOrganizerProfile(user,user.displayName);
    localStorage.setItem('organizerUid',user.uid);
    toast('Connexion Google réussie');
    location.replace('index.html');
  }).catch(err => { console.error(err); toast(err.message || 'Connexion Google impossible','error'); });
  setTimeout(() => { if (window.QuizOrganizer) window.QuizOrganizer.signInWithGoogle = googleRedirect; }, 0);

  // Participant : un seul flux avec réservation atomique du pseudo.
  async function joinParticipant(e) {
    e?.preventDefault?.(); e?.stopPropagation?.(); e?.stopImmediatePropagation?.();
    const code = String(document.getElementById('sessionCode')?.value||'').trim().toUpperCase();
    const name = String(document.getElementById('playerName')?.value||'').trim().slice(0,30).replace(/[<>"'&]/g,'');
    if (!/^[A-Z0-9]{6}$/.test(code) || !name) { toast('Code à 6 caractères et pseudo requis','error'); return false; }
    const btn = e?.submitter || document.querySelector('#joinModal button[type="submit"]');
    if (btn?.disabled) return false;
    if (btn) { btn.disabled=true; btn.dataset.label=btn.textContent; btn.textContent='Connexion…'; }
    try {
      if (firebase.auth().currentUser && !firebase.auth().currentUser.isAnonymous) await firebase.auth().signOut();
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);
      let user = firebase.auth().currentUser;
      if (!user?.isAnonymous) user=(await firebase.auth().signInAnonymously()).user;
      const session = await database.ref(`sessions/${code}`).once('value');
      if (!session.exists()) throw new Error('Session introuvable');
      const key=normalizePseudo(name); if(!key) throw new Error('Pseudo invalide');
      const ref=database.ref(`sessionPseudos/${code}/${key}`);
      const tx=await ref.transaction(cur => cur || {uid:user.uid,name,createdAt:Date.now()});
      if(!tx.committed || tx.snapshot.val()?.uid!==user.uid) throw new Error('Ce pseudo est déjà utilisé dans cette partie');
      await database.ref(`sessions/${code}/participants/${user.uid}`).set({id:user.uid,name,joinedAt:Date.now(),score:0});
      const local={code,isAdmin:false,participantId:user.uid,odparticipantId:user.uid,name};
      sessionStorage.setItem('quizSession',JSON.stringify(local)); localStorage.setItem('quizSession',JSON.stringify(local));
      location.href=`play.html?code=${encodeURIComponent(code)}`;
    } catch(err) { console.error(err); toast(err.message || 'Connexion participant impossible','error'); }
    finally { if(btn){btn.disabled=false;btn.textContent=btn.dataset.label||'Rejoindre';} }
    return false;
  }
  window.joinQuiz=joinParticipant;
  document.addEventListener('submit',e=>{ if(e.target.closest('#joinModal')) joinParticipant(e); },true);

  // Sauvegarde des quiz dans l’espace propre à l’organisateur.
  window.saveSession=async function(){
    try{
      const user=firebase.auth().currentUser; if(!user||user.isAnonymous) throw new Error('Connexion organisateur requise');
      const code=codeFromUrl(); if(!code) throw new Error('Session introuvable');
      const snap=await database.ref(`sessions/${code}`).once('value'); const s=snap.val();
      if(!s||s.ownerUid!==user.uid) throw new Error('Cette session ne vous appartient pas');
      const id=`${Date.now()}-${code}`;
      await database.ref(`savedSessions/${user.uid}/${id}`).set({id,sourceCode:code,name:s.name||`Quiz ${code}`,questions:s.questions||[],slides:s.slides||[],createdAt:Date.now(),updatedAt:Date.now()});
      toast('Quiz sauvegardé'); document.getElementById('saveSessionModal')?.classList.remove('active');
    }catch(err){console.error(err);toast(`Erreur de sauvegarde : ${err.message}`,'error');}
  };

  async function loadItems(){
    const code=codeFromUrl(); if(!code) return [];
    const snap=await database.ref(`sessions/${code}/questions`).once('value');
    const value=snap.val()||[]; return Array.isArray(value)?value:Object.keys(value).sort((a,b)=>Number(a)-Number(b)).map(k=>value[k]);
  }
  async function preview(index){
    const item=(await loadItems())[index], display=document.getElementById('questionDisplay'); if(!item||!display)return;
    const src=item.imageData||item.imageUrl||item.url;
    if(item.type==='slide'||src){display.innerHTML=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><img src="${esc(src)}" style="max-width:100%;max-height:70vh;object-fit:contain;border-radius:12px"></div>`;return;}
    const opts=Array.isArray(item.options)?item.options:Object.values(item.options||{});
    display.innerHTML=`<div style="padding:28px;width:100%"><small>Aperçu ${index+1}</small><h2>${esc(item.text||item.question||'Question')}</h2><div style="display:grid;gap:10px;margin-top:22px">${opts.map((o,i)=>`<div style="padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px">${i+1}. ${esc(o)}</div>`).join('')}</div></div>`;
  }
  async function move(index,delta){
    const items=await loadItems(),to=index+delta;if(to<0||to>=items.length)return;[items[index],items[to]]=[items[to],items[index]];
    await database.ref(`sessions/${codeFromUrl()}/questions`).set(items); await preview(to);
  }
  function enhance(){
    const list=document.getElementById('questionList');if(!list)return;
    [...list.children].forEach((el,i)=>{
      if(el.dataset.previewEnhanced)return;el.dataset.previewEnhanced='1';el.style.cursor='pointer';
      el.addEventListener('click',e=>{if(!e.target.closest('button'))preview(i)});
      const c=document.createElement('span');c.style.cssText='float:right;display:inline-flex;gap:3px';c.innerHTML='<button type="button">↑</button><button type="button">↓</button>';
      c.children[0].onclick=e=>{e.stopPropagation();move(i,-1).catch(x=>toast(x.message,'error'))};
      c.children[1].onclick=e=>{e.stopPropagation();move(i,1).catch(x=>toast(x.message,'error'))};el.appendChild(c);
    });
  }
  const obs=new MutationObserver(enhance);const list=document.getElementById('questionList');if(list)obs.observe(list,{childList:true});enhance();
})();
