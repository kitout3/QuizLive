(() => {
  'use strict';

  const state = { user:null, code:new URLSearchParams(location.search).get('code') || '', session:null, items:[], selected:-1, dirty:false, saving:false, aiModel:null };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toArray = value => Array.isArray(value) ? value.filter(Boolean) : Object.keys(value || {}).sort((a,b)=>Number(a)-Number(b)).map(k=>value[k]).filter(Boolean);
  const clean = (value,max=500) => String(value || '').trim().slice(0,max);

  function notify(text, error=false){ $('saveStatus').textContent=text; $('saveStatus').style.color=error?'#fca5a5':'#94a3b8'; }
  function defaultItem(type='mcq'){
    if(type==='slide') return {type:'slide',title:'Nouvelle slide',image:'',createdAt:Date.now()};
    if(type==='truefalse') return {type,text:'Nouvelle question',options:['Vrai','Faux'],correct:0,explanation:'',createdAt:Date.now()};
    if(type==='wordcloud') return {type,text:'Votre question ouverte',options:[],createdAt:Date.now()};
    return {type:'mcq',text:'Nouvelle question',options:['Réponse 1','Réponse 2','Réponse 3','Réponse 4'],correct:0,explanation:'',createdAt:Date.now()};
  }
  function isSlide(item){ return item?.type==='slide'||item?.slideUrl||item?.imageUrl||item?.image; }
  function itemTitle(item,index){ return isSlide(item)?(item.title||`Slide ${index+1}`):(item.text||`Question ${index+1}`); }
  function setDirty(){ state.dirty=true; notify('Modifications non enregistrées'); }

  async function uniqueCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for(let i=0;i<40;i++){ const code=Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); if(!(await database.ref(`sessions/${code}`).once('value')).exists()) return code; } throw new Error('Impossible de générer un code.'); }

  async function loadSession(){
    if(!state.code){
      state.session={name:'Nouveau quiz',status:'waiting',currentQuestion:-1,settings:{timerEnabled:true,animationsEnabled:true,musicEnabled:false}};
      $('quizTitle').value=state.session.name; renderList(); selectItem(-1); notify('Nouveau quiz'); return;
    }
    const snap=await database.ref(`sessions/${state.code}`).once('value');
    const session=snap.val();
    if(!session||session.ownerUid!==state.user.uid) throw new Error('Quiz introuvable ou accès refusé.');
    state.session=session; state.items=toArray(session.questions); $('quizTitle').value=session.name||'Quiz sans titre';
    $('timerSetting').checked=session.settings?.timerEnabled!==false; $('animationsSetting').checked=session.settings?.animationsEnabled!==false; $('musicSetting').checked=session.settings?.musicEnabled===true;
    $('openLiveBtn').href=`admin.html?code=${encodeURIComponent(state.code)}`; $('openLiveBtn').classList.remove('disabled');
    renderList(); selectItem(state.items.length?0:-1); notify('Quiz chargé');
  }

  async function saveQuiz(){
    if(state.saving) return; state.saving=true; $('saveQuizBtn').disabled=true; notify('Enregistrement…');
    try{
      if(!state.code) state.code=await uniqueCode();
      const now=Date.now(); const name=clean($('quizTitle').value,120)||'Quiz sans titre';
      const session={...(state.session||{}),code:state.code,name,ownerUid:state.user.uid,organizerEmail:state.user.email||'',createdAt:state.session?.createdAt||now,updatedAt:now,status:state.session?.status||'waiting',currentQuestion:Number.isInteger(state.session?.currentQuestion)?state.session.currentQuestion:-1,questions:state.items,participants:state.session?.participants||{},settings:{timerEnabled:$('timerSetting').checked,animationsEnabled:$('animationsSetting').checked,musicEnabled:$('musicSetting').checked}};
      const updates={}; updates[`sessions/${state.code}`]=session; updates[`organizerSessions/${state.user.uid}/${state.code}`]={code:state.code,name,createdAt:session.createdAt,status:session.status,organizationId:session.organizationId||''};
      await database.ref().update(updates); state.session=session; state.dirty=false;
      history.replaceState({},'',`editor.html?code=${state.code}`); $('openLiveBtn').href=`admin.html?code=${state.code}`; $('openLiveBtn').classList.remove('disabled'); notify('Enregistré');
    }catch(e){ console.error(e); notify(e.message||'Enregistrement impossible',true); }
    finally{state.saving=false;$('saveQuizBtn').disabled=false;}
  }

  function renderList(){
    $('itemCount').textContent=`${state.items.length} élément${state.items.length>1?'s':''}`;
    $('editorItemList').innerHTML=state.items.length?state.items.map((item,index)=>`<div class="editor-item ${index===state.selected?'active':''}" data-index="${index}"><span class="editor-item-index">${index+1}</span><button type="button" class="editor-item-main" data-select="${index}" style="background:none;border:0;color:inherit;text-align:left"><strong>${esc(itemTitle(item,index))}</strong><small>${isSlide(item)?'Slide':item.type==='truefalse'?'Vrai / Faux':item.type==='wordcloud'?'Nuage de mots':'QCM'}</small></button><span class="editor-item-actions"><button data-up="${index}" title="Monter">↑</button><button data-down="${index}" title="Descendre">↓</button></span></div>`).join(''):'<p style="color:#94a3b8;text-align:center">Aucun contenu</p>';
    document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectItem(Number(b.dataset.select)));
    document.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>moveItem(Number(b.dataset.up),-1));
    document.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>moveItem(Number(b.dataset.down),1));
  }
  function moveItem(index,delta){ const next=index+delta;if(next<0||next>=state.items.length)return; [state.items[index],state.items[next]]=[state.items[next],state.items[index]]; state.selected=next;setDirty();renderList();renderEditor(); }
  function selectItem(index){ syncCurrent();state.selected=index;renderList();renderEditor(); }
  function renderEditor(){
    const item=state.items[state.selected]; $('editorEmpty').hidden=!!item; $('editorForm').hidden=!item; if(!item)return;
    const slide=isSlide(item); $('questionFields').hidden=slide;$('slideFields').hidden=!slide;$('editorTypeBadge').textContent=slide?'🖼️ Slide':item.type==='truefalse'?'✓✗ Vrai / Faux':item.type==='wordcloud'?'☁️ Nuage de mots':'📝 QCM';
    if(slide){$('slideTitle').value=item.title||'';const src=item.image||item.imageUrl||item.slideUrl||'';$('slidePreview').innerHTML=src?`<img src="${esc(src)}" alt="Slide">`:'<span style="color:#94a3b8">Aucune image</span>';return;}
    $('questionText').value=item.text||'';$('questionExplanation').value=item.explanation||'';$('explanationLabel').hidden=item.type==='wordcloud';
    const options=item.type==='wordcloud'?[]:(item.type==='truefalse'?['Vrai','Faux']:(item.options||['','','','']).slice(0,4));
    $('answerFields').innerHTML=options.map((option,i)=>`<label class="editor-answer"><input type="radio" name="correctAnswer" value="${i}" ${Number(item.correct??item.correctAnswer??0)===i?'checked':''}><input class="answer-text" data-answer="${i}" value="${esc(typeof option==='object'?option.text:option)}" ${item.type==='truefalse'?'readonly':''}></label>`).join('');
  }
  function syncCurrent(){
    const item=state.items[state.selected];if(!item||$('editorForm').hidden)return;
    if(isSlide(item)){item.title=clean($('slideTitle').value,160);return;}
    item.text=clean($('questionText').value,500);item.explanation=clean($('questionExplanation').value,600);if(item.type!=='wordcloud'){item.options=[...document.querySelectorAll('.answer-text')].map(i=>clean(i.value,250));item.correct=Number(document.querySelector('input[name="correctAnswer"]:checked')?.value||0);}
  }
  function addItem(type){syncCurrent();state.items.push(defaultItem(type));state.selected=state.items.length-1;setDirty();renderList();renderEditor();}
  function deleteItem(){if(state.selected<0)return;state.items.splice(state.selected,1);state.selected=Math.min(state.selected,state.items.length-1);setDirty();renderList();renderEditor();}

  function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
  async function importImages(files){for(const file of files){state.items.push({type:'slide',title:file.name.replace(/\.[^.]+$/,''),image:await fileToDataUrl(file),createdAt:Date.now()});}state.selected=state.items.length-1;setDirty();renderList();renderEditor();}
  async function importPdf(file){
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; const bytes=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:bytes}).promise;
    for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo);const viewport=page.getViewport({scale:1.8});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;state.items.push({type:'slide',title:`${file.name} — page ${pageNo}`,image:canvas.toDataURL('image/jpeg',.9),createdAt:Date.now()});}
    state.selected=state.items.length-1;setDirty();renderList();renderEditor();
  }
  async function importSpreadsheet(file){
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:''});if(rows.length<2)throw new Error('Fichier vide.');
    rows.slice(1).forEach(row=>{const text=clean(row[0]);if(!text)return;const options=[row[1],row[2],row[3],row[4]].map(v=>clean(v,250));const correct=Math.max(0,Math.min(3,(Number(row[5])||1)-1));state.items.push({type:'mcq',text,options,correct,explanation:clean(row[6],600),createdAt:Date.now()});});
    state.selected=state.items.length-1;setDirty();renderList();renderEditor();
  }

  async function getAiModel(){
    if(state.aiModel)return state.aiModel;const [{initializeApp},{getAI,getGenerativeModel,GoogleAIBackend}]=await Promise.all([import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/12.3.0/firebase-ai.js')]);const app=initializeApp(window.QUIZLIVE_FIREBASE_CONFIG,`editor-ai-${Date.now()}`);state.aiModel=getGenerativeModel(getAI(app,{backend:new GoogleAIBackend()}),{model:'gemini-2.5-flash',systemInstruction:'Tu conçois des quiz en français et retournes uniquement du JSON valide.'});return state.aiModel;
  }
  async function generateAi(){
    const theme=clean($('aiTheme').value,500);if(theme.length<3){$('aiResult').textContent='Renseignez un thème précis.';return;}const count=Math.max(1,Math.min(20,Number($('aiCount').value)||5));$('generateAiBtn').disabled=true;$('aiResult').textContent='Génération en cours…';
    try{const model=await getAiModel();const prompt=`Génère ${count} questions en français sur: ${theme}. Niveau: ${$('aiLevel').value}. Format: ${$('aiFormat').value}. Retourne uniquement {"questions":[{"type":"mcq","text":"...","options":["...","...","...","..."],"correct":0,"explanation":"..."}]}. Pour truefalse options=["Vrai","Faux"].`;const result=await model.generateContent(prompt);const raw=result.response.text().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();const parsed=JSON.parse(raw.slice(raw.indexOf('{'),raw.lastIndexOf('}')+1));const generated=toArray(parsed.questions).map(q=>({type:q.type==='truefalse'?'truefalse':'mcq',text:clean(q.text),options:q.type==='truefalse'?['Vrai','Faux']:toArray(q.options).slice(0,4).map(v=>clean(v,250)),correct:Number(q.correct)||0,explanation:clean(q.explanation,600),aiGenerated:true,createdAt:Date.now()})).filter(q=>q.text);state.items.push(...generated);state.selected=state.items.length-generated.length;setDirty();renderList();renderEditor();$('aiResult').innerHTML=`<div class="editor-ai-card">${generated.length} question(s) ajoutée(s) au quiz.</div>`;}catch(e){console.error(e);$('aiResult').textContent=e.message||'Génération impossible.';}finally{$('generateAiBtn').disabled=false;}
  }

  function bind(){
    document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addItem(b.dataset.add));$('deleteItemBtn').onclick=deleteItem;$('saveQuizBtn').onclick=()=>{syncCurrent();saveQuiz();};$('quizTitle').oninput=setDirty;['timerSetting','animationsSetting','musicSetting'].forEach(id=>$(id).onchange=setDirty);
    $('editorForm').addEventListener('input',()=>{syncCurrent();setDirty();renderList();});$('slideImageInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;state.items[state.selected].image=await fileToDataUrl(file);setDirty();renderEditor();};
    $('excelTool').onclick=()=>$('spreadsheetInput').click();$('pdfTool').onclick=()=>$('pdfInput').click();$('slidesTool').onclick=()=>$('imagesInput').click();$('spreadsheetInput').onchange=async e=>{try{await importSpreadsheet(e.target.files[0]);}catch(err){notify(err.message,true);}};$('pdfInput').onchange=async e=>{try{notify('Conversion du PDF…');await importPdf(e.target.files[0]);notify('PDF importé');}catch(err){notify(err.message,true);}};$('imagesInput').onchange=e=>importImages([...e.target.files]);
    $('aiTool').onclick=()=>{$('aiPanel').hidden=false;};$('closeAiPanel').onclick=()=>{$('aiPanel').hidden=true;};$('generateAiBtn').onclick=generateAi;window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
  }

  bind();firebase.auth().onAuthStateChanged(async user=>{if(!user||user.isAnonymous){location.replace(`login.html?return=${encodeURIComponent(location.pathname+location.search)}`);return;}state.user=user;try{await loadSession();}catch(e){notify(e.message,true);}});
})();