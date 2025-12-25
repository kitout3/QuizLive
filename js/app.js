// === ADMIN AUTH GUARD (compat) ===
// ADMIN_UID is loaded from config.js (set via GitHub Secrets)
const ADMIN_UID = typeof ADMIN_UID_CONFIG !== 'undefined' ? ADMIN_UID_CONFIG : "YOUR_ADMIN_UID_HERE";

function showAdminLogin(show) {
  const overlay = document.getElementById("adminLoginOverlay");
  if (!overlay) return;
  overlay.style.display = show ? "flex" : "none";
  overlay.style.pointerEvents = show ? "auto" : "none";
}

function setLoginError(msg) {
  const box = document.getElementById("adminLoginErr");
  if (!box) return;
  box.textContent = msg || "";
  box.style.display = msg ? "block" : "none";
}

function bindAdminLoginUI() {
  const btn = document.getElementById("adminLoginBtn");
  const cancel = document.getElementById("adminCancelBtn");
  const forgotBtn = document.getElementById("forgotPasswordBtn");

  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      const email = (document.getElementById("adminEmail")?.value || "").trim();
      const pass = document.getElementById("adminPass")?.value || "";
      setLoginError("");
      if (!email || !pass) {
        setLoginError("Email et mot de passe requis.");
        return;
      }
      try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        await firebase.auth().signInWithEmailAndPassword(email, pass);
      } catch (e) {
        setLoginError(e?.message || "Connexion impossible.");
      }
    });
  }

  if (cancel && !cancel.dataset.bound) {
    cancel.dataset.bound = "1";
    cancel.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // Bouton mot de passe oublié
  if (forgotBtn && !forgotBtn.dataset.bound) {
    forgotBtn.dataset.bound = "1";
    forgotBtn.addEventListener("click", async () => {
      const email = (document.getElementById("adminEmail")?.value || "").trim();
      if (!email) {
        setLoginError("Entrez votre email pour réinitialiser le mot de passe.");
        return;
      }
      try {
        await firebase.auth().sendPasswordResetEmail(email);
        showToast("Email de réinitialisation envoyé !");
        setLoginError("");
      } catch (e) {
        setLoginError(e?.message || "Erreur lors de l'envoi.");
      }
    });
  }
}

function enforceAdminAccess() {
  if (document.body?.dataset?.page !== "admin") return;
  bindAdminLoginUI();

  // Vérifier si on est en mode création
  const urlParams = new URLSearchParams(window.location.search);
  const isCreateMode = urlParams.get('create') === '1';
  const hasCode = urlParams.get('code');

  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      showAdminLogin(true);
      return;
    }
    console.log("UID connecté :", user.uid);
    if (user.uid !== ADMIN_UID) {
      showAdminLogin(true);
      setLoginError("Accès refusé : compte admin requis.");
      return;
    }
    // Admin OK - reste connecté
    setLoginError("");
    showAdminLogin(false);
    console.log("Admin connecté OK:", user.uid);

    // Si on est en mode création, créer la session
    if (isCreateMode && localStorage.getItem('pendingSession')) {
      const code = await createSessionAfterAuth();
      if (code) {
        initAdmin();
      }
    } else if (hasCode) {
      // Session existante - initialiser
      initAdmin();
    } else if (!isCreateMode) {
      // Pas de code et pas en mode création - retour accueil
      window.location.href = 'index.html';
    }
  });
}

enforceAdminAccess();

// ============================================
// QuizzLive - Main Application Logic (v2)
// ============================================

// Fonction de sécurité - échappement HTML pour éviter XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Variables globales
let currentSession = null;
let playerSession = null;
let playerId = null;
let correctAnswer = 0;
let presenterWindow = null;
let draggedElement = null;

// Utility Functions
function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${type === 'success' ? '✓' : '✗'}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Modal Functions
function showJoinModal() {
    document.getElementById('joinModal').classList.add('active');
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        closeModals();
    }
});

// Go back to home - déconnexion admin uniquement ici
function goToHome() {
    if (confirm('Êtes-vous sûr de vouloir quitter cette session ?')) {
        // Déconnexion Firebase seulement quand on quitte
        if (document.body?.dataset?.page === 'admin') {
            firebase.auth().signOut();
        }
        localStorage.removeItem('quizSession');
        window.location.href = 'index.html';
    }
}

// ============================================
// LOGIN ADMIN POUR CRÉATION DE SESSION (Page d'accueil)
// ============================================

// Afficher le modal de création et réinitialiser les étapes
function showCreateModal() {
    document.getElementById('createModal').classList.add('active');
    // Réinitialiser les étapes
    const loginStep = document.getElementById('adminLoginStep');
    const createStep = document.getElementById('createSessionStep');
    const errBox = document.getElementById('createLoginErr');
    
    if (loginStep) loginStep.style.display = 'block';
    if (createStep) createStep.style.display = 'none';
    if (errBox) errBox.textContent = '';
    
    // Vérifier si déjà connecté en admin
    const user = firebase.auth().currentUser;
    if (user && user.uid === ADMIN_UID) {
        if (loginStep) loginStep.style.display = 'none';
        if (createStep) createStep.style.display = 'block';
    }
}

// Login admin pour créer une session (depuis la page d'accueil)
async function loginAdminForCreate() {
    const email = document.getElementById('createAdminEmail')?.value.trim();
    const pass = document.getElementById('createAdminPass')?.value;
    const errBox = document.getElementById('createLoginErr');
    
    errBox.textContent = '';
    
    if (!email || !pass) {
        errBox.textContent = 'Email et mot de passe requis';
        return;
    }
    
    try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, pass);
        
        if (userCredential.user.uid !== ADMIN_UID) {
            errBox.textContent = 'Accès refusé : compte admin requis';
            await firebase.auth().signOut();
            return;
        }
        
        // Admin connecté - afficher le formulaire de création
        document.getElementById('adminLoginStep').style.display = 'none';
        document.getElementById('createSessionStep').style.display = 'block';
        
    } catch (e) {
        errBox.textContent = e?.message || 'Connexion impossible';
    }
}

// Créer la session après login admin réussi
async function createQuizAfterLogin(event) {
    event.preventDefault();
    console.log('createQuizAfterLogin appelée');
    
    const user = firebase.auth().currentUser;
    console.log('User:', user?.uid);
    
    if (!user || user.uid !== ADMIN_UID) {
        showToast('Vous devez être connecté en admin', 'error');
        console.error('Pas admin ou pas connecté');
        return;
    }
    
    const sessionName = document.getElementById('sessionName').value.trim();
    const adminName = document.getElementById('adminName').value.trim();
    
    console.log('Session:', sessionName, 'Admin:', adminName);
    
    if (!sessionName || !adminName) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    const sessionCode = generateCode();
    console.log('Code généré:', sessionCode);
    
    const sessionData = {
        code: sessionCode,
        name: sessionName,
        admin: adminName,
        createdAt: Date.now(),
        status: 'waiting',
        currentQuestion: -1,
        questions: [],
        slides: [],
        participants: {},
        presenterMode: false
    };
    
    try {
        console.log('Tentative écriture Firebase...');
        await database.ref('sessions/' + sessionCode).set(sessionData);
        console.log('Session créée avec succès!');
        
        localStorage.setItem('quizSession', JSON.stringify({
            code: sessionCode,
            isAdmin: true,
            name: adminName
        }));
        
        console.log('Redirection vers admin.html...');
        window.location.href = `admin.html?code=${sessionCode}`;
        
    } catch (error) {
        console.error('Erreur Firebase:', error);
        alert('Erreur: ' + error.message); // Alert pour être sûr de voir l'erreur
        showToast('Erreur lors de la création: ' + error.message, 'error');
    }
}

// Ancienne fonction createQuiz (redirige maintenant vers le modal avec login)
function createQuiz(event) {
    event.preventDefault();
    showCreateModal();
}

// Fonction appelée après authentification admin réussie (depuis admin.html)
function createSessionAfterAuth() {
    const pending = localStorage.getItem('pendingSession');
    if (!pending) return false;
    
    const { sessionName, adminName } = JSON.parse(pending);
    const sessionCode = generateCode();
    
    const sessionData = {
        code: sessionCode,
        name: sessionName,
        admin: adminName,
        createdAt: Date.now(),
        status: 'waiting',
        currentQuestion: -1,
        questions: [],
        slides: [],
        participants: {},
        presenterMode: false
    };
    
    return database.ref('sessions/' + sessionCode).set(sessionData)
        .then(() => {
            localStorage.removeItem('pendingSession');
            localStorage.setItem('quizSession', JSON.stringify({
                code: sessionCode,
                isAdmin: true,
                name: adminName
            }));
            // Mettre à jour l'URL sans recharger
            window.history.replaceState({}, '', `admin.html?code=${sessionCode}`);
            return sessionCode;
        })
        .catch(error => {
            console.error('Error creating session:', error);
            showToast('Erreur lors de la création', 'error');
            return null;
        });
}

// ============================================
// JOIN QUIZ - AVEC AUTH ANONYME (inscription AVANT lecture)
// ============================================

async function joinQuiz(event) {
    event.preventDefault();
    
    const sessionCode = document.getElementById('sessionCode').value.trim().toUpperCase();
    let playerName = document.getElementById('playerName').value.trim();
    
    if (!sessionCode || !playerName) {
        showToast('Veuillez remplir tous les champs', 'error');
        return;
    }
    
    // Validation du pseudo
    playerName = playerName.substring(0, 30).replace(/[<>\"\'&]/g, '');
    
    if (playerName.length < 1) {
        showToast('Pseudo invalide', 'error');
        return;
    }
    
    try {
        // Étape 1: Authentification anonyme Firebase
        let user = firebase.auth().currentUser;
        if (!user || user.isAnonymous === false) {
            // Se déconnecter si c'est un admin puis se reconnecter en anonyme
            if (user && !user.isAnonymous) {
                await firebase.auth().signOut();
            }
            const userCredential = await firebase.auth().signInAnonymously();
            user = userCredential.user;
        }
        
        const odparticipantId = user.uid;
        
        // Étape 2: S'inscrire en tant que participant (écriture autorisée)
        const playerData = {
            id: odparticipantId,
            name: playerName,
            joinedAt: Date.now()
        };
        
        await database.ref(`sessions/${sessionCode}/participants/${odparticipantId}`).set(playerData);
        
        // Étape 3: Stocker les infos localement
        localStorage.setItem('quizSession', JSON.stringify({
            code: sessionCode,
            isAdmin: false,
            odparticipantId: odparticipantId,
            name: playerName
        }));
        
        // Étape 4: Rediriger (la lecture sera autorisée car participant inscrit)
        window.location.href = `play.html?code=${sessionCode}`;
        
    } catch (error) {
        console.error('Error joining session:', error);
        if (error.code === 'PERMISSION_DENIED') {
            showToast('Session introuvable ou accès refusé', 'error');
        } else {
            showToast('Erreur: ' + error.message, 'error');
        }
    }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

function initAdmin() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionCode = urlParams.get('code');
    
    if (!sessionCode) {
        return;
    }
    
    database.ref('sessions/' + sessionCode).on('value', snapshot => {
        if (!snapshot.exists()) {
            showToast('Session expirée', 'error');
            window.location.href = 'index.html';
            return;
        }
        
        currentSession = snapshot.val();
        currentSession.code = sessionCode;
        updateAdminUI();
        
        // Mettre à jour la fenêtre présentateur si ouverte
        if (presenterWindow && !presenterWindow.closed) {
            presenterWindow.postMessage({
                type: 'sessionUpdate',
                session: currentSession
            }, '*');
        }
    });
}

function updateAdminUI() {
    if (!currentSession) return;
    
    const codeDisplay = document.getElementById('sessionCode');
    if (codeDisplay) codeDisplay.textContent = currentSession.code;
    
    const nameDisplay = document.getElementById('sessionName');
    if (nameDisplay) nameDisplay.textContent = currentSession.name;
    
    const participantCount = Object.keys(currentSession.participants || {}).length;
    const countDisplay = document.getElementById('participantCount');
    if (countDisplay) countDisplay.textContent = participantCount;
    
    const presenterToggle = document.getElementById('presenterToggle');
    if (presenterToggle) {
        presenterToggle.checked = currentSession.presenterMode || false;
    }
    
    updateQuestionList();
    updateParticipantsList();
    updateCurrentQuestionDisplay();
    updateLeaderboard();
}

// Liste des questions avec drag & drop et boutons modifier/supprimer
function updateQuestionList() {
    const container = document.getElementById('questionList');
    if (!container) return;
    
    const items = currentSession.questions || [];
    
    container.innerHTML = items.map((q, index) => `
        <div class="question-item ${currentSession.currentQuestion === index ? 'active' : ''} ${q.type === 'slide' ? 'slide-item' : ''}" 
             draggable="true"
             data-index="${index}"
             ondragstart="handleDragStart(event)"
             ondragover="handleDragOver(event)"
             ondrop="handleDrop(event)"
             ondragend="handleDragEnd(event)">
            <div class="drag-handle">☰</div>
            <div class="question-info">
                <div class="question-type">${getQuestionTypeLabel(q.type)}</div>
                <div class="question-title">${q.text || q.name || 'Sans titre'}</div>
            </div>
            <div class="question-actions">
                <button class="action-btn edit-btn" onclick="event.stopPropagation(); showEditModal(${index})" title="Modifier">
                    ✏️
                </button>
                <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteQuestion(${index})" title="Supprimer">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

// Drag & Drop pour réorganiser les questions
function handleDragStart(e) {
    draggedElement = e.target.closest('.question-item');
    draggedElement.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedElement.dataset.index);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.question-item');
    if (target && target !== draggedElement) {
        const container = document.getElementById('questionList');
        const items = [...container.querySelectorAll('.question-item')];
        const draggedIdx = items.indexOf(draggedElement);
        const targetIdx = items.indexOf(target);
        
        if (draggedIdx < targetIdx) {
            target.parentNode.insertBefore(draggedElement, target.nextSibling);
        } else {
            target.parentNode.insertBefore(draggedElement, target);
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const container = document.getElementById('questionList');
    const items = [...container.querySelectorAll('.question-item')];
    const toIndex = items.indexOf(draggedElement);
    
    if (fromIndex !== toIndex) {
        reorderQuestions(fromIndex, toIndex);
    }
}

function handleDragEnd(e) {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
    }
}

function reorderQuestions(fromIndex, toIndex) {
    const questions = [...(currentSession.questions || [])];
    const [moved] = questions.splice(fromIndex, 1);
    questions.splice(toIndex, 0, moved);
    
    database.ref(`sessions/${currentSession.code}/questions`).set(questions)
        .then(() => showToast('Ordre mis à jour'))
        .catch(err => showToast('Erreur', 'error'));
}

function getQuestionTypeLabel(type) {
    const labels = {
        'mcq': '📝 QCM',
        'truefalse': '✓✗ Vrai/Faux',
        'wordcloud': '☁️ Nuage de mots',
        'ranking': '📊 Classement',
        'slide': '🖼️ Slide'
    };
    return labels[type] || type;
}

function updateParticipantsList() {
    const container = document.getElementById('participantsList');
    if (!container) return;
    
    const participants = Object.values(currentSession.participants || {});
    
    container.innerHTML = participants.map(p => {
        const safeName = escapeHtml(p.name);
        return `
            <div class="participant">
                <div class="participant-avatar">${safeName.charAt(0).toUpperCase()}</div>
                <div class="participant-name">${safeName}</div>
                <div class="participant-score">${parseInt(p.score) || 0}</div>
            </div>
        `;
    }).join('') || '<p style="color: var(--text-muted); text-align: center;">En attente de participants...</p>';
}

function updateCurrentQuestionDisplay() {
    const container = document.getElementById('questionDisplay');
    if (!container) return;
    
    const questions = currentSession.questions || [];
    const currentIndex = currentSession.currentQuestion;
    
    // Générer l'URL de participation
    const joinUrl = `${window.location.origin}${window.location.pathname.replace('admin.html', '')}play.html?code=${currentSession.code}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;
    
    // Si quiz non démarré ou pas de question courante
    if (currentSession.status === 'waiting' || currentIndex < 0 || currentIndex >= questions.length) {
        container.innerHTML = `
            <div class="waiting-screen">
                <div class="waiting-icon">🎯</div>
                <div class="waiting-text">
                    ${questions.length === 0 
                        ? 'Ajoutez des questions pour commencer' 
                        : 'Prêt à lancer le quiz !'}
                </div>
                
                <div class="qr-code-section">
                    <div class="qr-code-container">
                        <img src="${qrCodeUrl}" alt="QR Code" class="qr-code-img">
                    </div>
                    <p class="qr-instruction">Scannez pour rejoindre</p>
                    <p class="qr-url">${joinUrl}</p>
                </div>
                
                ${questions.length > 0 ? `
                    <button class="btn-control btn-start" onclick="startQuiz()" style="margin-top: 24px;">
                        🚀 Lancer le Quiz
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    const question = questions[currentIndex];
    
    if (question.type === 'mcq' || question.type === 'truefalse') {
        renderMCQAdmin(question, currentIndex);
    } else if (question.type === 'wordcloud') {
        renderWordCloudAdmin(question, currentIndex);
    } else if (question.type === 'ranking') {
        renderRankingAdmin(question, currentIndex);
    } else if (question.type === 'slide') {
        renderSlideAdmin(question, currentIndex);
    }
}

function renderMCQAdmin(question, index) {
    const container = document.getElementById('questionDisplay');
    const questions = currentSession.questions;
    const showResults = question.showResults || false;
    const results = calculateMCQResults(question);
    
    // For true/false questions, use V/F letters
    const isTrueFalse = question.type === 'truefalse';
    const getLetterClass = (i) => {
        if (isTrueFalse) return i === 0 ? 'true' : 'false';
        return ['a', 'b', 'c', 'd'][i];
    };
    const getLetter = (i) => {
        if (isTrueFalse) return i === 0 ? '✓' : '✗';
        return ['A', 'B', 'C', 'D'][i];
    };
    
    container.innerHTML = `
        <div class="current-question">
            <div class="question-number">Question ${index + 1} / ${questions.length}</div>
            <div class="question-text">${question.text}</div>
            
            ${showResults ? `
                <div class="results-chart">
                    ${question.options.map((opt, i) => {
                        const letter = getLetter(i);
                        const letterClass = getLetterClass(i);
                        const percentage = results.total > 0 ? Math.round((results.counts[i] / results.total) * 100) : 0;
                        const isCorrect = question.correct === i;
                        return `
                            <div class="chart-bar ${isCorrect ? 'correct-answer' : ''}">
                                <div class="chart-label opt-${letterClass}">${letter}. ${opt} ${isCorrect ? '✓' : ''}</div>
                                <div class="chart-progress">
                                    <div class="chart-fill opt-${letterClass}" style="width: ${Math.max(percentage, 5)}%">
                                        <span class="chart-percentage">${percentage}%</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    <div class="response-count">${results.total} réponse${results.total > 1 ? 's' : ''}</div>
                </div>
            ` : `
                <div class="options-grid ${isTrueFalse ? 'truefalse-admin' : ''}">
                    ${question.options.map((opt, i) => {
                        const letter = getLetter(i);
                        const letterClass = getLetterClass(i);
                        return `
                            <div class="option-btn opt-${letterClass}">
                                <span class="option-letter">${letter}</span>
                                <span>${opt}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
            
            <div class="control-buttons">
                ${!showResults ? `
                    <button class="btn-control btn-results" onclick="showQuestionResults(${index})">
                        📊 Afficher les résultats
                    </button>
                ` : ''}
                ${index < questions.length - 1 ? `
                    <button class="btn-control btn-next" onclick="nextQuestion()">
                        Question suivante →
                    </button>
                ` : `
                    <button class="btn-control btn-next" onclick="endQuiz()">
                        🏁 Terminer le quiz
                    </button>
                `}
            </div>
        </div>
    `;
}

function renderWordCloudAdmin(question, index) {
    const container = document.getElementById('questionDisplay');
    const questions = currentSession.questions;
    
    const wordCounts = {};
    const participants = currentSession.participants || {};
    
    Object.values(participants).forEach(p => {
        const answer = p.answers?.[index];
        if (answer && typeof answer === 'string') {
            const words = answer.split(',').map(w => w.trim().toLowerCase()).filter(w => w && w.length <= 50);
            words.slice(0, 10).forEach(word => { // Limite à 10 mots par participant
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
        }
    });
    
    const sortedWords = Object.entries(wordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30);
    
    const maxCount = sortedWords.length > 0 ? sortedWords[0][1] : 1;
    
    container.innerHTML = `
        <div class="current-question">
            <div class="question-number">Question ${index + 1} / ${questions.length}</div>
            <div class="question-text">${escapeHtml(question.text)}</div>
            
            <div class="wordcloud-container">
                ${sortedWords.length > 0 ? sortedWords.map(([word, count]) => {
                    const size = 16 + (count / maxCount) * 40;
                    const colors = ['#6366f1', '#f43f5e', '#10b981', '#fbbf24', '#06b6d4', '#a855f7'];
                    const color = colors[Math.floor(Math.random() * colors.length)];
                    return `<span class="word-item" style="font-size: ${size}px; color: ${color}">${escapeHtml(word)} (${count})</span>`;
                }).join('') : '<p style="color: var(--text-muted);">En attente des réponses...</p>'}
            </div>
            
            <div class="control-buttons">
                ${index < questions.length - 1 ? `
                    <button class="btn-control btn-next" onclick="nextQuestion()">
                        Question suivante →
                    </button>
                ` : `
                    <button class="btn-control btn-next" onclick="endQuiz()">
                        🏁 Terminer le quiz
                    </button>
                `}
            </div>
        </div>
    `;
}

function renderRankingAdmin(question, index) {
    const container = document.getElementById('questionDisplay');
    const questions = currentSession.questions;
    
    const participants = currentSession.participants || {};
    const itemScores = question.items.map(() => 0);
    let responseCount = 0;
    
    Object.values(participants).forEach(p => {
        const answer = p.answers?.[index];
        if (answer && Array.isArray(answer)) {
            responseCount++;
            answer.forEach((itemIndex, rank) => {
                itemScores[itemIndex] += (answer.length - rank);
            });
        }
    });
    
    const rankedItems = question.items
        .map((item, i) => ({ item, score: itemScores[i], index: i }))
        .sort((a, b) => b.score - a.score);
    
    container.innerHTML = `
        <div class="current-question">
            <div class="question-number">Question ${index + 1} / ${questions.length}</div>
            <div class="question-text">${question.text}</div>
            
            <div class="ranking-results">
                ${rankedItems.map((item, rank) => `
                    <div class="ranking-result-item">
                        <div class="rank-badge">#${rank + 1}</div>
                        <div class="rank-item-name">${item.item}</div>
                        <div class="rank-score">${item.score} pts</div>
                    </div>
                `).join('')}
                <div class="response-count">${responseCount} réponse${responseCount > 1 ? 's' : ''}</div>
            </div>
            
            <div class="control-buttons">
                ${index < questions.length - 1 ? `
                    <button class="btn-control btn-next" onclick="nextQuestion()">
                        Question suivante →
                    </button>
                ` : `
                    <button class="btn-control btn-next" onclick="endQuiz()">
                        🏁 Terminer le quiz
                    </button>
                `}
            </div>
        </div>
    `;
}

function renderSlideAdmin(slide, index) {
    const container = document.getElementById('questionDisplay');
    const questions = currentSession.questions;
    
    container.innerHTML = `
        <div class="current-question slide-display">
            <div class="question-number">Slide ${index + 1} / ${questions.length}</div>
            <div class="slide-preview">
                ${slide.imageData ? `<img src="${slide.imageData}" alt="${slide.name}" />` : `<div class="slide-placeholder">🖼️ ${slide.name}</div>`}
            </div>
            
            <div class="control-buttons">
                ${index < questions.length - 1 ? `
                    <button class="btn-control btn-next" onclick="nextQuestion()">
                        Suivant →
                    </button>
                ` : `
                    <button class="btn-control btn-next" onclick="endQuiz()">
                        🏁 Terminer le quiz
                    </button>
                `}
            </div>
        </div>
    `;
}

function calculateMCQResults(question) {
    const counts = question.options.map(() => 0);
    let total = 0;
    
    const participants = currentSession.participants || {};
    const questionIndex = currentSession.currentQuestion;
    
    Object.values(participants).forEach(p => {
        const answer = p.answers?.[questionIndex];
        if (answer !== undefined && answer !== null) {
            counts[answer]++;
            total++;
        }
    });
    
    return { counts, total };
}

function updateLeaderboard() {
    const container = document.getElementById('leaderboard');
    if (!container) return;
    
    const participants = Object.values(currentSession.participants || {});
    const sorted = participants.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
    
    const medals = ['🥇', '🥈', '🥉'];
    
    container.innerHTML = sorted.map((p, i) => {
        const safeName = escapeHtml(p.name);
        return `
            <div class="leaderboard-item">
                <div class="rank">${medals[i] || (i + 1)}</div>
                <div class="lb-info">
                    <div class="lb-name">${safeName}</div>
                    <div class="lb-stats">${Object.keys(p.answers || {}).length} réponses</div>
                </div>
                <div class="lb-score">${parseInt(p.score) || 0}</div>
            </div>
        `;
    }).join('') || '<p style="color: var(--text-muted); text-align: center;">Pas encore de classement</p>';
}

// NE PAS lancer le quiz en cliquant sur une question
function selectQuestion(index) {
    // On ne change la question que si le quiz est déjà lancé
    if (currentSession.status !== 'active') {
        showToast('Lancez d\'abord le quiz avec le bouton "Lancer"', 'error');
        return;
    }
    database.ref(`sessions/${currentSession.code}/currentQuestion`).set(index);
}

function startQuiz() {
    if (!currentSession.questions || currentSession.questions.length === 0) {
        showToast('Ajoutez au moins une question', 'error');
        return;
    }
    
    database.ref(`sessions/${currentSession.code}`).update({
        status: 'active',
        currentQuestion: 0
    });
    showToast('Quiz lancé !');
}

function nextQuestion() {
    const nextIndex = currentSession.currentQuestion + 1;
    if (nextIndex < currentSession.questions.length) {
        database.ref(`sessions/${currentSession.code}`).update({
            currentQuestion: nextIndex,
            [`questions/${nextIndex}/showResults`]: false
        });
    }
}

function showQuestionResults(index) {
    database.ref(`sessions/${currentSession.code}/questions/${index}/showResults`).set(true);
}

function endQuiz() {
    database.ref(`sessions/${currentSession.code}/status`).set('finished');
    showToast('Quiz terminé !');
}

function deleteQuestion(index) {
    if (!confirm('Supprimer cet élément ?')) return;
    
    const questions = [...currentSession.questions];
    questions.splice(index, 1);
    
    database.ref(`sessions/${currentSession.code}/questions`).set(questions)
        .then(() => showToast('Supprimé'));
}

// ============================================
// MODE PRÉSENTATEUR - Nouvelle fenêtre
// ============================================

function togglePresenterMode() {
    const isChecked = document.getElementById('presenterToggle').checked;
    
    if (isChecked) {
        // Ouvrir nouvelle fenêtre présentateur
        openPresenterWindow();
    } else {
        // Fermer la fenêtre présentateur
        if (presenterWindow && !presenterWindow.closed) {
            presenterWindow.close();
        }
    }
    
    database.ref(`sessions/${currentSession.code}/presenterMode`).set(isChecked);
}

function openPresenterWindow() {
    const width = 1200;
    const height = 800;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    presenterWindow = window.open(
        `presenter.html?code=${currentSession.code}`,
        'QuizLive_Presenter',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes`
    );
    
    if (!presenterWindow) {
        showToast('Popup bloquée. Autorisez les popups.', 'error');
        document.getElementById('presenterToggle').checked = false;
    }
}

// ============================================
// SAUVEGARDE / RESTAURATION DE SESSION
// ============================================

function saveSession() {
    if (!currentSession) {
        showToast('Aucune session à sauvegarder', 'error');
        return;
    }
    
    const sessionToSave = {
        name: currentSession.name,
        questions: currentSession.questions || [],
        savedAt: Date.now()
    };
    
    // Sauvegarder dans Firebase sous /savedSessions
    const saveId = generateId();
    database.ref(`savedSessions/${saveId}`).set(sessionToSave)
        .then(() => {
            showToast('Session sauvegardée !');
            loadSavedSessionsList();
        })
        .catch(err => showToast('Erreur de sauvegarde', 'error'));
}

function loadSavedSessionsList() {
    const container = document.getElementById('savedSessionsList');
    if (!container) return;
    
    database.ref('savedSessions').once('value', snapshot => {
        const sessions = snapshot.val() || {};
        const items = Object.entries(sessions);
        
        if (items.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Aucune session sauvegardée</p>';
            return;
        }
        
        container.innerHTML = items.map(([id, s]) => `
            <div class="saved-session-item">
                <div class="saved-info">
                    <div class="saved-name">${s.name}</div>
                    <div class="saved-date">${new Date(s.savedAt).toLocaleDateString('fr-FR')}</div>
                    <div class="saved-count">${(s.questions || []).length} questions</div>
                </div>
                <div class="saved-actions">
                    <button onclick="restoreSession('${id}')" class="btn-restore">Charger</button>
                    <button onclick="deleteSavedSession('${id}')" class="btn-delete-saved">🗑️</button>
                </div>
            </div>
        `).join('');
    });
}

function restoreSession(saveId) {
    database.ref(`savedSessions/${saveId}`).once('value', snapshot => {
        const saved = snapshot.val();
        if (!saved) {
            showToast('Session introuvable', 'error');
            return;
        }
        
        // Charger les questions dans la session courante
        database.ref(`sessions/${currentSession.code}/questions`).set(saved.questions || [])
            .then(() => {
                showToast(`${(saved.questions || []).length} questions chargées !`);
                closeModals();
            })
            .catch(err => showToast('Erreur de chargement', 'error'));
    });
}

function deleteSavedSession(saveId) {
    if (!confirm('Supprimer cette session sauvegardée ?')) return;
    
    database.ref(`savedSessions/${saveId}`).remove()
        .then(() => {
            showToast('Session supprimée');
            loadSavedSessionsList();
        });
}

function showSaveModal() {
    document.getElementById('saveSessionModal').classList.add('active');
    loadSavedSessionsList();
}

// ============================================
// IMPORT SLIDES PPT
// ============================================

function showImportSlidesModal() {
    document.getElementById('importSlidesModal').classList.add('active');
}

function handleSlidesImport(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const importBtn = document.getElementById('importSlidesBtn');
    importBtn.innerHTML = '⏳ Import en cours...';
    importBtn.disabled = true;
    
    const newSlides = [];
    let processed = 0;
    
    Array.from(files).forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            newSlides.push({
                type: 'slide',
                name: file.name.replace(/\.[^/.]+$/, ''),
                imageData: e.target.result,
                createdAt: Date.now() + idx
            });
            
            processed++;
            if (processed === files.length) {
                // Trier par nom
                newSlides.sort((a, b) => a.createdAt - b.createdAt);
                
                // Ajouter aux questions existantes
                const existingQuestions = currentSession.questions || [];
                const allItems = [...existingQuestions, ...newSlides];
                
                database.ref(`sessions/${currentSession.code}/questions`).set(allItems)
                    .then(() => {
                        showToast(`${files.length} slide(s) importé(s) !`);
                        closeModals();
                        event.target.value = '';
                    })
                    .catch(err => showToast('Erreur d\'import', 'error'))
                    .finally(() => {
                        importBtn.innerHTML = 'Sélectionner les images';
                        importBtn.disabled = false;
                    });
            }
        };
        reader.readAsDataURL(file);
    });
}

// ============================================
// MODIFIER UNE QUESTION
// ============================================

let editingQuestionIndex = null;

function showEditModal(index) {
    editingQuestionIndex = index;
    const question = currentSession.questions[index];
    
    if (question.type === 'slide') {
        showToast('Les slides ne peuvent pas être modifiés, supprimez et réimportez.', 'error');
        return;
    }
    
    document.getElementById('editQuestionModal').classList.add('active');
    document.getElementById('editQuestionText').value = question.text || '';
    document.getElementById('editSelectedQuestionType').value = question.type;
    
    const optionsContainer = document.getElementById('editQuestionOptionsContainer');
    
    if (question.type === 'mcq') {
        correctAnswer = question.correct || 0;
        optionsContainer.innerHTML = `
            <div class="options-creator">
                ${['A', 'B', 'C', 'D'].map((letter, i) => `
                    <div class="option-input-row">
                        <div class="option-color opt-${letter.toLowerCase()}">${letter}</div>
                        <input type="text" id="editOption${i}" value="${question.options?.[i] || ''}" placeholder="Option ${letter}" class="form-group">
                        <button type="button" class="correct-toggle ${question.correct === i ? 'active' : ''}" data-index="${i}" onclick="toggleCorrectEdit(${i})">
                            ✓ Correcte
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    } else if (question.type === 'wordcloud') {
        optionsContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Question ouverte - pas d\'options à configurer.</p>';
    } else if (question.type === 'ranking') {
        optionsContainer.innerHTML = `
            <div class="options-creator" id="editRankingItems">
                ${(question.items || []).map((item, i) => `
                    <div class="option-input-row">
                        <div class="ranking-number">${i + 1}</div>
                        <input type="text" class="edit-ranking-input form-group" value="${item}" placeholder="Élément ${i + 1}">
                    </div>
                `).join('')}
            </div>
            <button type="button" class="add-question-btn" onclick="addEditRankingItem()">+ Ajouter un élément</button>
        `;
    }
}

function toggleCorrectEdit(index) {
    correctAnswer = index;
    document.querySelectorAll('#editQuestionOptionsContainer .correct-toggle').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
}

function addEditRankingItem() {
    const container = document.getElementById('editRankingItems');
    const count = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'option-input-row';
    div.innerHTML = `
        <div class="ranking-number">${count}</div>
        <input type="text" class="edit-ranking-input form-group" placeholder="Élément ${count}">
    `;
    container.appendChild(div);
}

function updateQuestion(event) {
    event.preventDefault();
    
    if (editingQuestionIndex === null) return;
    
    const question = currentSession.questions[editingQuestionIndex];
    const text = document.getElementById('editQuestionText').value.trim();
    
    if (!text) {
        showToast('Entrez le texte de la question', 'error');
        return;
    }
    
    const updatedQuestion = {
        ...question,
        text: text
    };
    
    if (question.type === 'mcq') {
        const options = [];
        for (let i = 0; i < 4; i++) {
            const opt = document.getElementById(`editOption${i}`).value.trim();
            if (opt) options.push(opt);
        }
        
        if (options.length < 2) {
            showToast('Ajoutez au moins 2 options', 'error');
            return;
        }
        
        updatedQuestion.options = options;
        updatedQuestion.correct = correctAnswer;
    } else if (question.type === 'ranking') {
        const items = [];
        document.querySelectorAll('.edit-ranking-input').forEach(input => {
            if (input.value.trim()) items.push(input.value.trim());
        });
        
        if (items.length < 2) {
            showToast('Ajoutez au moins 2 éléments', 'error');
            return;
        }
        
        updatedQuestion.items = items;
    }
    
    database.ref(`sessions/${currentSession.code}/questions/${editingQuestionIndex}`).set(updatedQuestion)
        .then(() => {
            showToast('Question mise à jour !');
            closeModals();
            editingQuestionIndex = null;
        })
        .catch(err => showToast('Erreur', 'error'));
}

// ============================================
// AJOUTER UNE QUESTION
// ============================================

function showAddQuestionModal() {
    document.getElementById('addQuestionModal').classList.add('active');
    selectQuestionType('mcq');
}

function selectQuestionType(type) {
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`)?.classList.add('active');
    
    const optionsContainer = document.getElementById('questionOptionsContainer');
    
    if (type === 'mcq') {
        correctAnswer = 0;
        optionsContainer.innerHTML = `
            <div class="options-creator">
                ${['A', 'B', 'C', 'D'].map((letter, i) => `
                    <div class="option-input-row">
                        <div class="option-color opt-${letter.toLowerCase()}">${letter}</div>
                        <input type="text" id="option${i}" placeholder="Option ${letter}" class="form-group">
                        <button type="button" class="correct-toggle ${i === 0 ? 'active' : ''}" data-index="${i}" onclick="toggleCorrect(${i})">
                            ✓ Correcte
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    } else if (type === 'truefalse') {
        correctAnswer = 0;
        optionsContainer.innerHTML = `
            <div class="truefalse-selector">
                <p style="color: var(--text-secondary); margin-bottom: 16px; text-align: center;">
                    Sélectionnez la bonne réponse :
                </p>
                <div class="truefalse-options">
                    <button type="button" class="tf-btn tf-true active" onclick="selectTrueFalse(0)">
                        ✓ VRAI
                    </button>
                    <button type="button" class="tf-btn tf-false" onclick="selectTrueFalse(1)">
                        ✗ FAUX
                    </button>
                </div>
            </div>
        `;
    } else if (type === 'wordcloud') {
        optionsContainer.innerHTML = `
            <p style="color: var(--text-secondary); text-align: center;">
                Les participants pourront entrer leurs mots librement.
            </p>
        `;
    } else if (type === 'ranking') {
        optionsContainer.innerHTML = `
            <div class="options-creator" id="rankingItems">
                <div class="option-input-row">
                    <div class="ranking-number">1</div>
                    <input type="text" class="ranking-input form-group" placeholder="Élément 1">
                </div>
                <div class="option-input-row">
                    <div class="ranking-number">2</div>
                    <input type="text" class="ranking-input form-group" placeholder="Élément 2">
                </div>
                <div class="option-input-row">
                    <div class="ranking-number">3</div>
                    <input type="text" class="ranking-input form-group" placeholder="Élément 3">
                </div>
            </div>
            <button type="button" class="add-question-btn" onclick="addRankingItem()">+ Ajouter un élément</button>
        `;
    }
    
    document.getElementById('selectedQuestionType').value = type;
}

function selectTrueFalse(value) {
    correctAnswer = value;
    document.querySelectorAll('.tf-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === value);
    });
}

function toggleCorrect(index) {
    correctAnswer = index;
    document.querySelectorAll('#questionOptionsContainer .correct-toggle').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
}

function addRankingItem() {
    const container = document.getElementById('rankingItems');
    const count = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'option-input-row';
    div.innerHTML = `
        <div class="ranking-number">${count}</div>
        <input type="text" class="ranking-input form-group" placeholder="Élément ${count}">
    `;
    container.appendChild(div);
}

function saveQuestion(event) {
    event.preventDefault();
    
    const type = document.getElementById('selectedQuestionType').value;
    const text = document.getElementById('questionText').value.trim();
    
    if (!text) {
        showToast('Entrez le texte de la question', 'error');
        return;
    }
    
    let questionData = { type, text, createdAt: Date.now() };
    
    if (type === 'mcq') {
        const options = [];
        for (let i = 0; i < 4; i++) {
            const opt = document.getElementById(`option${i}`).value.trim();
            if (opt) options.push(opt);
        }
        if (options.length < 2) { showToast('Ajoutez au moins 2 options', 'error'); return; }
        questionData.options = options;
        questionData.correct = correctAnswer;
    } else if (type === 'truefalse') {
        questionData.options = ['Vrai', 'Faux'];
        questionData.correct = correctAnswer;
    } else if (type === 'ranking') {
        const items = [];
        document.querySelectorAll('.ranking-input').forEach(input => {
            if (input.value.trim()) items.push(input.value.trim());
        });
        if (items.length < 2) { showToast('Ajoutez au moins 2 éléments', 'error'); return; }
        questionData.items = items;
    }
    
    const questions = currentSession.questions || [];
    questions.push(questionData);
    
    database.ref(`sessions/${currentSession.code}/questions`).set(questions)
        .then(() => {
            showToast('Question ajoutée !');
            closeModals();
            document.getElementById('addQuestionForm').reset();
            correctAnswer = 0;
        });
}

// Import Excel
function showImportExcelModal() {
    document.getElementById('importExcelModal').classList.add('active');
}

function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const importBtn = document.getElementById('importExcelBtn');
    importBtn.innerHTML = '⏳ Import...';
    importBtn.disabled = true;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            
            const questions = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                const question = {
                    type: 'mcq',
                    text: row[0],
                    options: [row[1], row[2], row[3], row[4]].filter(opt => opt),
                    correct: parseInt(row[5]) - 1,
                    createdAt: Date.now()
                };
                if (question.text && question.options.length >= 2) questions.push(question);
            }
            
            if (questions.length === 0) { showToast('Aucune question valide', 'error'); return; }
            
            const allQuestions = [...(currentSession.questions || []), ...questions];
            database.ref(`sessions/${currentSession.code}/questions`).set(allQuestions)
                .then(() => { showToast(`${questions.length} questions importées !`); closeModals(); });
        } catch (err) { showToast('Erreur de lecture', 'error'); }
        finally { importBtn.innerHTML = 'Sélectionner'; importBtn.disabled = false; }
    };
    reader.readAsArrayBuffer(file);
}

// ============================================
// PLAYER FUNCTIONS
// ============================================

function initPlayer() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionCode = urlParams.get('code');
    const sessionInfo = JSON.parse(localStorage.getItem('quizSession') || '{}');
    
    // Si pas de code dans l'URL, retour à l'accueil
    if (!sessionCode) {
        window.location.href = 'index.html';
        return;
    }
    
    const storedId = sessionInfo.odparticipantId || sessionInfo.playerId;
    
    // CAS 1: L'utilisateur vient de joinQuiz() - il a déjà ses infos en localStorage
    if (storedId && sessionInfo.code === sessionCode) {
        console.log("Session trouvée en localStorage:", storedId);
        
        // Attendre que Firebase Auth soit prêt
        const unsubscribe = firebase.auth().onAuthStateChanged(user => {
            unsubscribe(); // Se désabonner après la première réponse valide
            
            if (user && user.uid === storedId) {
                // Parfait - l'utilisateur est le même
                console.log("Auth OK, démarrage session");
                startPlayerSession(sessionCode, user.uid, sessionInfo.name);
            } else if (user && user.uid !== storedId) {
                // Mauvais utilisateur - demander de se réinscrire
                console.log("UID différent, réinscription nécessaire");
                localStorage.removeItem('quizSession');
                showJoinViaQRModal(sessionCode);
            } else {
                // Pas connecté - essayer de se reconnecter
                console.log("Pas connecté, tentative de reconnexion...");
                firebase.auth().signInAnonymously()
                    .then(cred => {
                        if (cred.user.uid === storedId) {
                            startPlayerSession(sessionCode, cred.user.uid, sessionInfo.name);
                        } else {
                            // Nouveau UID - doit se réinscrire
                            localStorage.removeItem('quizSession');
                            showJoinViaQRModal(sessionCode);
                        }
                    })
                    .catch(() => {
                        showJoinViaQRModal(sessionCode);
                    });
            }
        });
        return;
    }
    
    // CAS 2: Arrivée via QR code (pas d'infos en localStorage)
    console.log("Pas de session en localStorage, affichage modal");
    showJoinViaQRModal(sessionCode);
}

// Démarrer l'écoute de la session (après inscription)
function startPlayerSession(sessionCode, odparticipantId, playerName) {
    playerId = odparticipantId;
    
    const nameDisplay = document.getElementById('playerName');
    if (nameDisplay) nameDisplay.textContent = playerName;
    
    database.ref('sessions/' + sessionCode).on('value', snapshot => {
        if (!snapshot.exists()) {
            showToast('Session expirée ou accès refusé', 'error');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }
        playerSession = snapshot.val();
        playerSession.code = sessionCode;
        updatePlayerUI();
    }, error => {
        console.error('Erreur lecture session:', error);
        showToast('Accès refusé - Réinscription nécessaire', 'error');
        localStorage.removeItem('quizSession');
        showJoinViaQRModal(sessionCode);
    });
}

// Afficher le modal pour rejoindre via QR code
function showJoinViaQRModal(code) {
    const modal = document.getElementById('joinViaQRModal');
    const codeInput = document.getElementById('qrSessionCode');
    if (modal) {
        modal.classList.add('active');
        if (codeInput) codeInput.value = code;
    }
}

// Rejoindre via QR code (formulaire pseudo uniquement)
async function joinViaQR(event) {
    event.preventDefault();
    
    const sessionCode = document.getElementById('qrSessionCode').value.trim().toUpperCase();
    let playerName = document.getElementById('qrPlayerName').value.trim();
    
    // Validation du pseudo
    if (!playerName) {
        showToast('Entrez votre pseudo', 'error');
        return;
    }
    
    // Limite de longueur et caractères autorisés
    playerName = playerName.substring(0, 30).replace(/[<>\"\'&]/g, '');
    
    if (playerName.length < 1) {
        showToast('Pseudo invalide', 'error');
        return;
    }
    
    try {
        // Authentification anonyme Firebase
        let user = firebase.auth().currentUser;
        if (!user) {
            const userCredential = await firebase.auth().signInAnonymously();
            user = userCredential.user;
        }
        
        const odparticipantId = user.uid;
        
        const playerData = {
            id: odparticipantId,
            name: playerName,
            joinedAt: Date.now()
        };
        
        await database.ref(`sessions/${sessionCode}/participants/${odparticipantId}`).set(playerData);
        
        localStorage.setItem('quizSession', JSON.stringify({
            code: sessionCode,
            isAdmin: false,
            odparticipantId: odparticipantId,
            name: playerName
        }));
        
        // Fermer le modal et initialiser le player
        document.getElementById('joinViaQRModal')?.classList.remove('active');
        
        playerId = odparticipantId;
        const nameDisplay = document.getElementById('playerName');
        if (nameDisplay) nameDisplay.textContent = playerName;
        
        // Écouter la session
        database.ref('sessions/' + sessionCode).on('value', snapshot => {
            if (!snapshot.exists()) {
                showToast('Session expirée', 'error');
                setTimeout(() => window.location.href = 'index.html', 2000);
                return;
            }
            playerSession = snapshot.val();
            playerSession.code = sessionCode;
            updatePlayerUI();
        });
        
        showToast('Bienvenue ' + playerName + ' !');
        
    } catch (error) {
        console.error('Error joining session:', error);
        showToast('Erreur lors de la connexion: ' + error.message, 'error');
    }
}

function updatePlayerUI() {
    if (!playerSession) return;
    
    const player = playerSession.participants?.[playerId];
    const scoreDisplay = document.getElementById('playerScore');
    if (scoreDisplay && player) scoreDisplay.textContent = player.score || 0;
    
    if (playerSession.status === 'finished') { renderPlayerFinished(); return; }
    
    const currentIndex = playerSession.currentQuestion;
    if (currentIndex < 0 || !playerSession.questions || currentIndex >= playerSession.questions.length) {
        renderPlayerWaiting();
        return;
    }
    
    const question = playerSession.questions[currentIndex];
    if (question.type === 'mcq' || question.type === 'truefalse') renderPlayerMCQ(question, currentIndex);
    else if (question.type === 'wordcloud') renderPlayerWordCloud(question, currentIndex);
    else if (question.type === 'ranking') renderPlayerRanking(question, currentIndex);
    else if (question.type === 'slide') renderPlayerSlide(question, currentIndex);
}

function renderPlayerWaiting() {
    document.getElementById('playerContent').innerHTML = `
        <div class="waiting-screen">
            <div class="waiting-icon">⏳</div>
            <div class="waiting-text">En attente du lancement...</div>
            <p style="color: var(--text-secondary); margin-top: 16px;">Code: <strong>${playerSession.code}</strong></p>
        </div>
    `;
}

// Variable pour stocker la sélection temporaire du joueur
let tempSelectedAnswer = null;

function selectAnswer(index) {
    tempSelectedAnswer = index;
    // Mettre à jour visuellement
    document.querySelectorAll('.player-option').forEach((btn, i) => {
        btn.classList.toggle('selected', i === index);
    });
    // Activer le bouton valider
    const validateBtn = document.getElementById('validateAnswerBtn');
    if (validateBtn) {
        validateBtn.disabled = false;
        validateBtn.classList.add('active');
    }
}

function validateAnswer(questionIndex) {
    if (tempSelectedAnswer === null) {
        showToast('Sélectionnez une réponse', 'error');
        return;
    }
    submitMCQAnswer(questionIndex, tempSelectedAnswer);
    tempSelectedAnswer = null;
}

function renderPlayerMCQ(question, index) {
    const container = document.getElementById('playerContent');
    const player = playerSession.participants?.[playerId];
    const hasAnswered = player?.answers?.[index] !== undefined;
    const showResults = question.showResults || false;
    const playerAnswer = player?.answers?.[index];
    const isCorrect = hasAnswered && question.correct === playerAnswer;
    
    // Reset temp selection when rendering new question
    if (!hasAnswered) {
        tempSelectedAnswer = null;
    }
    
    // Calculate results
    const counts = question.options.map(() => 0);
    let total = 0;
    Object.values(playerSession.participants || {}).forEach(p => {
        const answer = p.answers?.[index];
        if (answer !== undefined && answer !== null) { counts[answer]++; total++; }
    });
    
    // For true/false questions, use V/F letters
    const isTrueFalse = question.type === 'truefalse';
    const getLetterClass = (i) => {
        if (isTrueFalse) return i === 0 ? 'true' : 'false';
        return ['a', 'b', 'c', 'd'][i];
    };
    const getLetter = (i) => {
        if (isTrueFalse) return i === 0 ? '✓' : '✗';
        return ['A', 'B', 'C', 'D'][i];
    };
    
    container.innerHTML = `
        <div class="player-question">
            <div class="player-question-number">Question ${index + 1}</div>
            <div class="player-question-text">${question.text}</div>
            
            ${!showResults ? `
                ${!hasAnswered ? `
                    <div class="player-options ${isTrueFalse ? 'truefalse-grid' : ''}">
                        ${question.options.map((opt, i) => {
                            const letter = getLetter(i);
                            const letterClass = getLetterClass(i);
                            return `
                                <button class="player-option opt-${letterClass}" 
                                        onclick="selectAnswer(${i})">
                                    <span class="option-letter">${letter}</span>
                                    <span>${opt}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <button id="validateAnswerBtn" class="btn-validate-answer" disabled onclick="validateAnswer(${index})">
                        ✓ Valider ma réponse
                    </button>
                ` : `
                    <div class="player-options ${isTrueFalse ? 'truefalse-grid' : ''}">
                        ${question.options.map((opt, i) => {
                            const letter = getLetter(i);
                            const letterClass = getLetterClass(i);
                            const isSelected = playerAnswer === i;
                            return `
                                <button class="player-option opt-${letterClass} ${isSelected ? 'selected' : ''}" disabled>
                                    <span class="option-letter">${letter}</span>
                                    <span>${opt}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <div class="waiting-feedback">
                        <div class="waiting-icon">✓</div>
                        <div class="waiting-text">Réponse envoyée ! En attente des résultats...</div>
                    </div>
                `}
            ` : `
                <div class="player-result-feedback ${isCorrect ? 'correct' : 'incorrect'}">
                    <div class="feedback-icon">${isCorrect ? '🎉' : '😔'}</div>
                    <div class="feedback-message">${isCorrect ? 'Bonne réponse ! +100 points' : 'Mauvaise réponse'}</div>
                </div>
                <div class="player-results">
                    ${question.options.map((opt, i) => {
                        const letter = getLetter(i);
                        const letterClass = getLetterClass(i);
                        const percentage = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
                        const isCorrectOpt = question.correct === i;
                        const isPlayerAns = hasAnswered && playerAnswer === i;
                        return `
                            <div class="player-result-bar ${isCorrectOpt ? 'correct-answer' : ''} ${isPlayerAns ? 'player-answered' : ''}">
                                <div class="result-label">
                                    ${isCorrectOpt ? '<span class="correct-arrow">➜</span>' : ''}
                                    <span class="result-letter opt-${letterClass}">${letter}</span>
                                    <span class="result-text">${opt}</span>
                                    ${isCorrectOpt ? '<span class="correct-badge">✓ Bonne réponse</span>' : ''}
                                    ${isPlayerAns && !isCorrectOpt ? '<span class="your-answer-badge">Votre réponse</span>' : ''}
                                </div>
                                <div class="result-bar-container">
                                    <div class="result-bar-fill opt-${letterClass}" style="width: ${Math.max(percentage, 8)}%">
                                        <span class="result-percentage">${percentage}%</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    <div class="result-info">${total} participant${total > 1 ? 's' : ''} ${total > 1 ? 'ont' : 'a'} répondu</div>
                </div>
            `}
        </div>
    `;
}

function renderPlayerWordCloud(question, index) {
    const container = document.getElementById('playerContent');
    const player = playerSession.participants?.[playerId];
    const hasAnswered = player?.answers?.[index] !== undefined;
    
    container.innerHTML = `
        <div class="player-question">
            <div class="player-question-number">Question ${index + 1}</div>
            <div class="player-question-text">${question.text}</div>
            ${!hasAnswered ? `
                <div class="word-input-container">
                    <input type="text" id="wordInput" class="word-input" placeholder="Mots séparés par des virgules">
                    <button class="btn-primary" onclick="submitWordCloud(${index})">Envoyer</button>
                </div>
            ` : `<div class="waiting-feedback"><div class="waiting-icon">✓</div><div class="waiting-text">Mots envoyés !</div></div>`}
        </div>
    `;
}

function renderPlayerRanking(question, index) {
    const container = document.getElementById('playerContent');
    const player = playerSession.participants?.[playerId];
    const hasAnswered = player?.answers?.[index] !== undefined;
    
    if (hasAnswered) {
        container.innerHTML = `<div class="player-question"><div class="waiting-feedback"><div class="waiting-icon">✓</div><div class="waiting-text">Classement envoyé !</div></div></div>`;
        return;
    }
    
    if (!window.currentRanking) window.currentRanking = question.items.map((_, i) => i);
    
    container.innerHTML = `
        <div class="player-question">
            <div class="player-question-number">Question ${index + 1}</div>
            <div class="player-question-text">${question.text}</div>
            <p style="color: var(--text-secondary); text-align: center; margin-bottom: 16px;">Glissez pour classer</p>
            <div id="rankingList" class="ranking-list">
                ${window.currentRanking.map((itemIndex, rank) => `
                    <div class="ranking-item" draggable="true" data-index="${itemIndex}">
                        <div class="ranking-handle">☰</div>
                        <div class="ranking-number">${rank + 1}</div>
                        <div class="ranking-text">${question.items[itemIndex]}</div>
                    </div>
                `).join('')}
            </div>
            <button class="btn-primary" onclick="submitRanking(${index})" style="margin-top: 24px;">Valider</button>
        </div>
    `;
    initPlayerDragAndDrop();
}

function renderPlayerSlide(slide, index) {
    document.getElementById('playerContent').innerHTML = `
        <div class="player-slide-fullscreen">
            ${slide.imageData ? `<img src="${slide.imageData}" alt="${escapeHtml(slide.name)}" />` : `<div class="slide-placeholder-full">🖼️ ${escapeHtml(slide.name)}</div>`}
        </div>
    `;
}

function initPlayerDragAndDrop() {
    const list = document.getElementById('rankingList');
    if (!list) return;
    let draggedItem = null;
    
    list.querySelectorAll('.ranking-item').forEach(item => {
        item.addEventListener('dragstart', function() { draggedItem = this; this.classList.add('dragging'); });
        item.addEventListener('dragend', function() { this.classList.remove('dragging'); updateRankingNumbers(); });
        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            const afterElement = getDragAfterElement(list, e.clientY);
            if (afterElement == null) list.appendChild(draggedItem);
            else list.insertBefore(draggedItem, afterElement);
        });
    });
}

function getDragAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.ranking-item:not(.dragging)')];
    return elements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset, element: child };
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateRankingNumbers() {
    const items = document.querySelectorAll('#rankingList .ranking-item');
    items.forEach((item, i) => item.querySelector('.ranking-number').textContent = i + 1);
    window.currentRanking = [...items].map(item => parseInt(item.dataset.index));
}

function renderPlayerFinished() {
    const container = document.getElementById('playerContent');
    const participants = Object.values(playerSession.participants || {});
    const sorted = participants.sort((a, b) => (b.score || 0) - (a.score || 0));
    const playerRank = sorted.findIndex(p => p.id === playerId) + 1;
    const player = playerSession.participants?.[playerId];
    const medals = ['🥇', '🥈', '🥉'];
    
    container.innerHTML = `
        <div class="player-question" style="text-align: center;">
            <div class="waiting-icon" style="font-size: 5rem;">${medals[playerRank - 1] || '🎉'}</div>
            <h2 style="font-size: 2rem; margin: 24px 0;">Quiz terminé !</h2>
            <p style="font-size: 1.5rem; color: var(--text-secondary);">
                Vous êtes ${playerRank}${playerRank === 1 ? 'er' : 'ème'} avec ${parseInt(player?.score) || 0} points
            </p>
            <div class="leaderboard" style="margin-top: 32px; text-align: left;">
                <h3 style="margin-bottom: 16px;">🏆 Classement final</h3>
                ${sorted.slice(0, 5).map((p, i) => {
                    const safeName = escapeHtml(p.name);
                    return `
                        <div class="leaderboard-item ${p.id === playerId ? 'active' : ''}">
                            <div class="rank">${medals[i] || (i + 1)}</div>
                            <div class="lb-info"><div class="lb-name">${safeName} ${p.id === playerId ? '(vous)' : ''}</div></div>
                            <div class="lb-score">${parseInt(p.score) || 0}</div>
                        </div>
                    `;
                }).join('')}
            </div>
            <button class="btn-primary" onclick="goToHome()" style="margin-top: 32px;">🏠 Retour</button>
        </div>
    `;
}

function submitMCQAnswer(questionIndex, answerIndex) {
    const question = playerSession.questions[questionIndex];
    const isCorrect = question.correct === answerIndex;
    const player = playerSession.participants?.[playerId];
    const newScore = (player?.score || 0) + (isCorrect ? 100 : 0);
    
    // Envoyer la réponse
    database.ref(`sessions/${playerSession.code}/participants/${playerId}/answers/${questionIndex}`).set(answerIndex)
        .then(() => {
            // Mettre à jour le score séparément
            return database.ref(`sessions/${playerSession.code}/participants/${playerId}/score`).set(newScore);
        })
        .catch(error => {
            console.error('Erreur:', error);
            // Si le score ne peut pas être mis à jour (règles), ce n'est pas bloquant
        });
}

function submitWordCloud(questionIndex) {
    let words = document.getElementById('wordInput').value.trim();
    if (!words) { showToast('Entrez au moins un mot', 'error'); return; }
    
    // Validation : limite la longueur et nettoie les caractères dangereux
    words = words.substring(0, 200).replace(/[<>\"\'&]/g, '');
    
    database.ref(`sessions/${playerSession.code}/participants/${playerId}/answers/${questionIndex}`).set(words);
}

function submitRanking(questionIndex) {
    database.ref(`sessions/${playerSession.code}/participants/${playerId}/answers/${questionIndex}`).set(window.currentRanking || [])
        .then(() => { showToast('Classement envoyé !'); window.currentRanking = null; });
}

// ============================================
// PRESENTER PAGE FUNCTIONS
// ============================================

function initPresenter() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionCode = urlParams.get('code');
    
    if (!sessionCode) {
        document.getElementById('presenterContent').innerHTML = `
            <div class="presenter-waiting">
                <h1>❌ Code manquant</h1>
                <p>Ouvrez le mode présentation depuis la page admin.</p>
            </div>
        `;
        return;
    }
    
    // Afficher le chargement
    document.getElementById('presenterContent').innerHTML = `
        <div class="presenter-waiting">
            <h1>🎯 QuizLive</h1>
            <p>Connexion en cours...</p>
        </div>
    `;
    
    // Attendre que Firebase Auth soit prêt
    firebase.auth().onAuthStateChanged(user => {
        console.log("Presenter auth state:", user ? user.uid : "non connecté");
        
        if (!user) {
            // Pas connecté - essayer de se connecter avec les credentials stockés
            document.getElementById('presenterContent').innerHTML = `
                <div class="presenter-waiting">
                    <h1>🔒 Connexion requise</h1>
                    <p>Veuillez d'abord vous connecter en admin sur la page principale,<br>puis rouvrir le mode présentation.</p>
                    <button onclick="window.close()" style="margin-top: 30px; padding: 15px 30px; font-size: 1.1rem; background: var(--gradient-primary); border: none; border-radius: 12px; color: white; cursor: pointer;">
                        Fermer cette fenêtre
                    </button>
                </div>
            `;
            return;
        }
        
        if (user.uid !== ADMIN_UID) {
            document.getElementById('presenterContent').innerHTML = `
                <div class="presenter-waiting">
                    <h1>🔒 Accès restreint</h1>
                    <p>Seul l'administrateur peut accéder au mode présentation.</p>
                </div>
            `;
            return;
        }
        
        console.log("Admin connecté, chargement de la session:", sessionCode);
        
        // Admin connecté - écouter la session
        database.ref('sessions/' + sessionCode).on('value', snapshot => {
            if (!snapshot.exists()) {
                document.getElementById('presenterContent').innerHTML = `
                    <div class="presenter-waiting">
                        <h1>❌ Session introuvable</h1>
                        <p>Code: ${sessionCode}</p>
                    </div>
                `;
                return;
            }
            const session = snapshot.val();
            session.code = sessionCode;
            console.log("Session chargée:", session.name);
            renderPresenterView(session);
        }, error => {
            console.error('Erreur lecture session:', error);
            document.getElementById('presenterContent').innerHTML = `
                <div class="presenter-waiting">
                    <h1>❌ Erreur</h1>
                    <p>${error.message}</p>
                    <p style="margin-top: 20px; font-size: 0.9rem; color: #888;">
                        Vérifiez que vous êtes connecté en admin et que les règles Firebase sont correctes.
                    </p>
                </div>
            `;
        });
    });
}

function renderPresenterView(session) {
    const container = document.getElementById('presenterContent');
    if (!container) return;
    
    const questions = session.questions || [];
    const currentIndex = session.currentQuestion;
    
    // Générer l'URL de participation
    const baseUrl = window.location.origin + window.location.pathname.replace('presenter.html', '');
    const joinUrl = `${baseUrl}play.html?code=${session.code}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(joinUrl)}`;
    
    if (currentIndex < 0 || currentIndex >= questions.length) {
        container.innerHTML = `
            <div class="presenter-waiting">
                <h1>🎯 ${session.name}</h1>
                
                <div class="presenter-join-section">
                    <div class="presenter-qr-container">
                        <img src="${qrCodeUrl}" alt="QR Code" class="presenter-qr-img">
                    </div>
                    <div class="presenter-code-section">
                        <p class="presenter-code-label">Code de la session</p>
                        <p class="presenter-code">${session.code}</p>
                        <p class="presenter-url">${joinUrl}</p>
                    </div>
                </div>
                
                <div class="presenter-status">
                    <div class="participant-count-large">
                        <span class="count-number">${Object.keys(session.participants || {}).length}</span>
                        <span class="count-label">participant${Object.keys(session.participants || {}).length > 1 ? 's' : ''}</span>
                    </div>
                    <p class="waiting-message">En attente du lancement...</p>
                </div>
            </div>
        `;
        return;
    }
    
    const question = questions[currentIndex];
    
    if (question.type === 'mcq' || question.type === 'truefalse') renderPresenterMCQ(session, question, currentIndex);
    else if (question.type === 'wordcloud') renderPresenterWordCloud(session, question, currentIndex);
    else if (question.type === 'ranking') renderPresenterRanking(session, question, currentIndex);
    else if (question.type === 'slide') renderPresenterSlide(session, question, currentIndex);
}

function renderPresenterMCQ(session, question, index) {
    const container = document.getElementById('presenterContent');
    const showResults = question.showResults || false;
    
    const counts = question.options.map(() => 0);
    let total = 0;
    Object.values(session.participants || {}).forEach(p => {
        const answer = p.answers?.[index];
        if (answer !== undefined && answer !== null) { counts[answer]++; total++; }
    });
    
    container.innerHTML = `
        <div class="presenter-question">
            <div class="presenter-header">
                <span>Question ${index + 1} / ${session.questions.length}</span>
                <span>${Object.keys(session.participants || {}).length} participants</span>
            </div>
            <h1 class="presenter-text">${question.text}</h1>
            
            ${showResults ? `
                <div class="presenter-results">
                    ${question.options.map((opt, i) => {
                        const letter = ['A', 'B', 'C', 'D'][i];
                        const percentage = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
                        const isCorrect = question.correct === i;
                        return `
                            <div class="presenter-bar ${isCorrect ? 'correct' : ''}">
                                <div class="bar-label">${letter}. ${opt} ${isCorrect ? '✓' : ''}</div>
                                <div class="bar-track">
                                    <div class="bar-fill opt-${letter.toLowerCase()}" style="width: ${Math.max(percentage, 5)}%">
                                        <span>${percentage}%</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : `
                <div class="presenter-options">
                    ${question.options.map((opt, i) => {
                        const letter = ['A', 'B', 'C', 'D'][i];
                        return `<div class="presenter-option opt-${letter.toLowerCase()}"><span class="opt-letter">${letter}</span><span>${opt}</span></div>`;
                    }).join('')}
                </div>
            `}
            <div class="presenter-footer">${total} réponse${total > 1 ? 's' : ''}</div>
        </div>
    `;
}

function renderPresenterWordCloud(session, question, index) {
    const container = document.getElementById('presenterContent');
    const wordCounts = {};
    Object.values(session.participants || {}).forEach(p => {
        const answer = p.answers?.[index];
        if (answer && typeof answer === 'string') {
            answer.split(',').map(w => w.trim().toLowerCase()).filter(w => w).forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
        }
    });
    
    const sortedWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 40);
    const maxCount = sortedWords.length > 0 ? sortedWords[0][1] : 1;
    
    container.innerHTML = `
        <div class="presenter-question">
            <div class="presenter-header"><span>Question ${index + 1} / ${session.questions.length}</span></div>
            <h1 class="presenter-text">${question.text}</h1>
            <div class="presenter-wordcloud">
                ${sortedWords.map(([word, count]) => {
                    const size = 20 + (count / maxCount) * 60;
                    const colors = ['#6366f1', '#f43f5e', '#10b981', '#fbbf24', '#06b6d4', '#a855f7'];
                    return `<span style="font-size: ${size}px; color: ${colors[Math.floor(Math.random() * colors.length)]}; padding: 8px;">${word}</span>`;
                }).join('')}
            </div>
        </div>
    `;
}

function renderPresenterRanking(session, question, index) {
    const container = document.getElementById('presenterContent');
    const itemScores = question.items.map(() => 0);
    let responseCount = 0;
    
    Object.values(session.participants || {}).forEach(p => {
        const answer = p.answers?.[index];
        if (answer && Array.isArray(answer)) {
            responseCount++;
            answer.forEach((itemIndex, rank) => { itemScores[itemIndex] += (answer.length - rank); });
        }
    });
    
    const rankedItems = question.items.map((item, i) => ({ item, score: itemScores[i] })).sort((a, b) => b.score - a.score);
    
    container.innerHTML = `
        <div class="presenter-question">
            <div class="presenter-header"><span>Question ${index + 1} / ${session.questions.length}</span></div>
            <h1 class="presenter-text">${question.text}</h1>
            <div class="presenter-ranking">
                ${rankedItems.map((item, rank) => `
                    <div class="presenter-rank-item"><span class="rank-num">#${rank + 1}</span><span class="rank-name">${item.item}</span><span class="rank-pts">${item.score} pts</span></div>
                `).join('')}
            </div>
            <div class="presenter-footer">${responseCount} réponse${responseCount > 1 ? 's' : ''}</div>
        </div>
    `;
}

function renderPresenterSlide(session, slide, index) {
    document.getElementById('presenterContent').innerHTML = `
        <div class="presenter-slide">
            ${slide.imageData ? `<img src="${slide.imageData}" alt="${escapeHtml(slide.name)}" />` : `<div class="slide-placeholder-big">🖼️ ${escapeHtml(slide.name)}</div>`}
        </div>
    `;
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    // admin est géré par enforceAdminAccess() qui s'exécute automatiquement
    if (page === 'player') initPlayer();
    else if (page === 'presenter') initPresenter();
});
