// QuizLive — Générateur IA de questions avec Firebase AI Logic / Gemini
(() => {
  'use strict';

  if (document.body?.dataset?.page !== 'admin') return;

  const state = { generated: [], busy: false, model: null };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const toast = (message, type = 'success') => typeof window.showToast === 'function'
    ? window.showToast(message, type)
    : alert(message);
  const codeFromUrl = () => new URLSearchParams(location.search).get('code');
  const toArray = value => Array.isArray(value)
    ? value.filter(Boolean)
    : Object.keys(value || {}).sort((a, b) => Number(a) - Number(b)).map(key => value[key]).filter(Boolean);

  async function getModel() {
    if (state.model) return state.model;
    if (!window.QUIZLIVE_FIREBASE_CONFIG) {
      throw new Error('Configuration Firebase indisponible. Rechargez la page.');
    }

    const [{ initializeApp }, { getAI, getGenerativeModel, GoogleAIBackend }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.3.0/firebase-ai.js')
    ]);

    const aiApp = initializeApp(window.QUIZLIVE_FIREBASE_CONFIG, `quizlive-ai-${Date.now()}`);
    const ai = getAI(aiApp, { backend: new GoogleAIBackend() });
    state.model = getGenerativeModel(ai, {
      model: 'gemini-2.5-flash',
      systemInstruction: `Tu es un concepteur professionnel de quiz francophones.
Tu produis exclusivement un JSON valide, sans balise Markdown ni commentaire extérieur.
Les questions doivent être factuellement correctes, non ambiguës, adaptées au public demandé et comporter une seule bonne réponse.
Évite les sujets dangereux, haineux, sexuels explicites ou illégaux. Pour les sujets sensibles, reste pédagogique et neutre.`
    });
    return state.model;
  }

  function injectButton() {
    if (document.getElementById('aiQuestionButton')) return;
    const reference = [...document.querySelectorAll('button')].find(button =>
      /ajouter une question/i.test(button.textContent || '')
    );
    if (!reference) return;

    const button = document.createElement('button');
    button.id = 'aiQuestionButton';
    button.type = 'button';
    button.className = reference.className || 'add-question-btn';
    button.style.cssText = `${reference.getAttribute('style') || ''};border-color:#a855f7;color:#c084fc`;
    button.innerHTML = '✨ Générer avec l’IA';
    button.addEventListener('click', openModal);
    reference.insertAdjacentElement('afterend', button);
  }

  function ensureModal() {
    let modal = document.getElementById('aiQuestionModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'aiQuestionModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:760px;max-height:90vh;overflow:auto">
        <button class="modal-close" id="aiQuestionClose">&times;</button>
        <h2>✨ Générer des questions avec l’IA</h2>
        <p style="color:var(--text-secondary);margin:8px 0 20px">Décrivez le thème, vérifiez les propositions, puis ajoutez uniquement les questions souhaitées.</p>

        <div class="form-group">
          <label>Thème ou sujet</label>
          <textarea id="aiTheme" rows="3" maxlength="500" placeholder="Ex. : Les bases de la gestion de patrimoine en France" style="width:100%;resize:vertical"></textarea>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
          <div class="form-group"><label>Nombre</label><input id="aiCount" type="number" min="1" max="20" value="5"></div>
          <div class="form-group"><label>Difficulté</label><select id="aiDifficulty"><option value="facile">Facile</option><option value="intermédiaire" selected>Intermédiaire</option><option value="difficile">Difficile</option></select></div>
          <div class="form-group"><label>Format</label><select id="aiType"><option value="mixte" selected>Mixte</option><option value="qcm">QCM uniquement</option><option value="vrai-faux">Vrai / Faux</option></select></div>
          <div class="form-group"><label>Public</label><input id="aiAudience" maxlength="100" value="Grand public" placeholder="Étudiants, salariés…"></div>
        </div>

        <div class="form-group">
          <label>Consignes complémentaires <span style="color:var(--text-muted)">(facultatif)</span></label>
          <input id="aiInstructions" maxlength="300" placeholder="Ex. : privilégier les situations pratiques">
        </div>

        <div id="aiQuestionError" style="color:#fca5a5;min-height:22px"></div>
        <button id="aiGenerateButton" type="button" class="btn-primary" style="width:100%">✨ Générer les questions</button>

        <div id="aiGeneratedSection" style="display:none;margin-top:22px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px">
            <h3>Propositions</h3>
            <label style="font-size:.9rem"><input id="aiSelectAll" type="checkbox" checked> Tout sélectionner</label>
          </div>
          <div id="aiGeneratedList" style="display:grid;gap:12px"></div>
          <button id="aiAddSelectedButton" type="button" class="btn-primary" style="width:100%;margin-top:18px">Ajouter les questions sélectionnées</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelector('#aiQuestionClose').onclick = () => modal.classList.remove('active');
    modal.querySelector('#aiGenerateButton').onclick = generateQuestions;
    modal.querySelector('#aiAddSelectedButton').onclick = addSelectedQuestions;
    modal.querySelector('#aiSelectAll').onchange = event => {
      modal.querySelectorAll('.ai-question-check').forEach(input => { input.checked = event.target.checked; });
    };
    return modal;
  }

  function openModal() {
    const modal = ensureModal();
    modal.querySelector('#aiQuestionError').textContent = '';
    modal.classList.add('active');
  }

  function normalizeQuestion(question) {
    const type = question?.type === 'truefalse' ? 'truefalse' : 'mcq';
    const text = String(question?.text || '').trim().slice(0, 500);
    let options = toArray(question?.options).map(option => String(option).trim().slice(0, 250)).filter(Boolean);
    let correct = Number(question?.correct);

    if (type === 'truefalse') {
      options = ['Vrai', 'Faux'];
      correct = correct === 1 ? 1 : 0;
    } else {
      options = options.slice(0, 4);
      while (options.length < 4) options.push(`Réponse ${options.length + 1}`);
      if (!Number.isInteger(correct) || correct < 0 || correct > 3) correct = 0;
    }

    if (!text) return null;
    return {
      type,
      text,
      options,
      correct,
      explanation: String(question?.explanation || '').trim().slice(0, 600),
      aiGenerated: true,
      createdAt: Date.now()
    };
  }

  function parseJson(text) {
    const cleaned = String(text || '').trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '');
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first < 0 || last < first) throw new Error('Réponse IA non exploitable. Relancez la génération.');
    return JSON.parse(cleaned.slice(first, last + 1));
  }

  async function generateQuestions() {
    if (state.busy) return;
    const modal = ensureModal();
    const theme = modal.querySelector('#aiTheme').value.trim();
    const count = Math.max(1, Math.min(20, Number(modal.querySelector('#aiCount').value) || 5));
    const difficulty = modal.querySelector('#aiDifficulty').value;
    const type = modal.querySelector('#aiType').value;
    const audience = modal.querySelector('#aiAudience').value.trim() || 'Grand public';
    const instructions = modal.querySelector('#aiInstructions').value.trim();
    const error = modal.querySelector('#aiQuestionError');
    const button = modal.querySelector('#aiGenerateButton');

    error.textContent = '';
    if (theme.length < 3) {
      error.textContent = 'Renseignez un thème suffisamment précis.';
      return;
    }

    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) {
      error.textContent = 'Connexion organisateur requise.';
      return;
    }

    state.busy = true;
    button.disabled = true;
    button.textContent = 'Génération en cours…';

    try {
      const model = await getModel();
      const prompt = `Génère ${count} questions de quiz en français.
Thème : ${theme}
Difficulté : ${difficulty}
Public : ${audience}
Format : ${type}
Consignes supplémentaires : ${instructions || 'Aucune'}

Retourne exactement cet objet JSON :
{
  "questions": [
    {
      "type": "mcq" ou "truefalse",
      "text": "Question claire",
      "options": ["Réponse A", "Réponse B", "Réponse C", "Réponse D"],
      "correct": 0,
      "explanation": "Explication courte et factuelle"
    }
  ]
}

Règles :
- Pour un QCM, fournis exactement 4 options et l’index correct entre 0 et 3.
- Pour un vrai/faux, utilise options ["Vrai", "Faux"] et correct 0 ou 1.
- Respecte strictement le nombre demandé.
- Aucune question en doublon.
- Une seule réponse correcte par question.`;

      const result = await model.generateContent(prompt);
      const parsed = parseJson(result.response.text());
      state.generated = toArray(parsed.questions).map(normalizeQuestion).filter(Boolean).slice(0, count);
      if (!state.generated.length) throw new Error('Aucune question valide n’a été générée.');
      renderGenerated();
    } catch (generationError) {
      console.error('Génération IA :', generationError);
      const message = String(generationError?.message || 'Génération impossible');
      error.textContent = /app.?check/i.test(message)
        ? 'Firebase App Check bloque la requête. Configurez AI Logic et App Check dans Firebase.'
        : /not found|404/i.test(message)
          ? 'Le modèle IA n’est pas disponible dans ce projet. Activez Firebase AI Logic.'
          : message;
    } finally {
      state.busy = false;
      button.disabled = false;
      button.textContent = '✨ Générer les questions';
    }
  }

  function renderGenerated() {
    const modal = ensureModal();
    const section = modal.querySelector('#aiGeneratedSection');
    const list = modal.querySelector('#aiGeneratedList');
    section.style.display = 'block';
    modal.querySelector('#aiSelectAll').checked = true;
    list.innerHTML = state.generated.map((question, index) => `
      <article style="border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px">
        <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">
          <input class="ai-question-check" type="checkbox" data-index="${index}" checked style="margin-top:5px">
          <span style="flex:1">
            <strong>${index + 1}. ${esc(question.text)}</strong>
            <span style="display:block;color:var(--text-muted);font-size:.82rem;margin-top:4px">${question.type === 'truefalse' ? 'Vrai / Faux' : 'QCM'}</span>
          </span>
        </label>
        <div style="display:grid;gap:6px;margin:10px 0 0 28px">
          ${question.options.map((option, optionIndex) => `<div style="padding:8px 10px;border-radius:8px;background:${optionIndex === question.correct ? 'rgba(16,185,129,.16)' : 'rgba(255,255,255,.04)'}">${optionIndex === question.correct ? '✓ ' : ''}${esc(option)}</div>`).join('')}
        </div>
        ${question.explanation ? `<p style="margin:10px 0 0 28px;color:var(--text-secondary);font-size:.88rem"><strong>Explication :</strong> ${esc(question.explanation)}</p>` : ''}
      </article>`).join('');
  }

  async function addSelectedQuestions() {
    const modal = ensureModal();
    const selected = [...modal.querySelectorAll('.ai-question-check:checked')]
      .map(input => state.generated[Number(input.dataset.index)])
      .filter(Boolean);
    if (!selected.length) {
      modal.querySelector('#aiQuestionError').textContent = 'Sélectionnez au moins une question.';
      return;
    }

    const user = firebase.auth().currentUser;
    const code = codeFromUrl();
    if (!user || user.isAnonymous || !code) {
      modal.querySelector('#aiQuestionError').textContent = 'Session organisateur introuvable.';
      return;
    }

    const button = modal.querySelector('#aiAddSelectedButton');
    button.disabled = true;
    button.textContent = 'Ajout en cours…';
    try {
      const sessionRef = database.ref(`sessions/${code}`);
      const snap = await sessionRef.once('value');
      const session = snap.val();
      if (!session || session.ownerUid !== user.uid) throw new Error('Cette session ne vous appartient pas.');
      const existing = toArray(session.questions);
      await sessionRef.child('questions').set([...existing, ...selected]);
      modal.classList.remove('active');
      toast(`${selected.length} question${selected.length > 1 ? 's' : ''} ajoutée${selected.length > 1 ? 's' : ''}`);
    } catch (addError) {
      console.error('Ajout questions IA :', addError);
      modal.querySelector('#aiQuestionError').textContent = addError.message || 'Ajout impossible.';
    } finally {
      button.disabled = false;
      button.textContent = 'Ajouter les questions sélectionnées';
    }
  }

  const observer = new MutationObserver(injectButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  injectButton();
})();