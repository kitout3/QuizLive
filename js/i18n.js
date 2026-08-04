// QuizLive — internationalisation globale FR / EN
(() => {
  'use strict';

  const STORAGE_KEY = 'quizliveLanguage';
  const SUPPORTED = ['fr', 'en'];
  const exact = {
    en: {
      'Quiz Interactifs': 'Interactive Quizzes',
      'En Temps Réel': 'In Real Time',
      'Créez des quiz engageants, nuages de mots et sondages pour captiver votre audience. Résultats instantanés et classements en direct.': 'Create engaging quizzes, word clouds and polls to captivate your audience. Instant results and live rankings.',
      'Se connecter': 'Sign in',
      'Créer un compte': 'Create an account',
      'Créer mon compte': 'Create my account',
      'Créer un quiz': 'Create a quiz',
      'Créer un Quiz': 'Create a Quiz',
      'Créer un nouveau quiz': 'Create a new quiz',
      'Rejoindre une session': 'Join a session',
      'Rejoindre un quiz': 'Join a quiz',
      'Rejoindre': 'Join',
      'Mon espace': 'My workspace',
      'Espace organisateur': 'Organizer workspace',
      'Se déconnecter': 'Sign out',
      'Retour à l’accueil': 'Back to home',
      'Retour': 'Back',
      'Continuer avec Google': 'Continue with Google',
      'G Continuer avec Google': 'G Continue with Google',
      'Connexion Google en cours…': 'Signing in with Google…',
      'Mot de passe oublié ?': 'Forgot password?',
      'Mot de passe': 'Password',
      'Adresse email': 'Email address',
      'Email': 'Email',
      'Nom': 'Name',
      'Votre nom': 'Your name',
      'Votre pseudo': 'Your nickname',
      'Code de la session': 'Session code',
      'Code de session': 'Session code',
      'Saisissez le code communiqué par l’organisateur': 'Enter the code provided by the organizer',
      'Vue d’ensemble': 'Overview',
      'Mes quiz': 'My quizzes',
      'Historique': 'History',
      'Espace entreprise': 'Company workspace',
      'Organisation': 'Organization',
      'Abonnement': 'Subscription',
      'Mon profil': 'My profile',
      'Paramètres': 'Settings',
      'Créer un quiz': 'Create a quiz',
      'Gérez vos quiz et votre compte organisateur.': 'Manage your quizzes and organizer account.',
      'Quiz créés': 'Quizzes created',
      'Participants cumulés': 'Total participants',
      'Réponses enregistrées': 'Recorded answers',
      'Taux de réussite': 'Success rate',
      'Derniers quiz': 'Recent quizzes',
      'Votre compte': 'Your account',
      'Organisateur': 'Organizer',
      'Offre actuelle': 'Current plan',
      'Choisir cette offre': 'Choose this plan',
      'Gérer mon abonnement et mes factures': 'Manage my subscription and invoices',
      'Informations personnelles': 'Personal information',
      'Nom affiché': 'Display name',
      'Méthode de connexion': 'Sign-in method',
      'Statut': 'Status',
      'Actif': 'Active',
      'Enregistrer les modifications': 'Save changes',
      'Préférences des nouveaux quiz': 'New quiz preferences',
      'Activer le timer par défaut': 'Enable timer by default',
      'Activer les animations par défaut': 'Enable animations by default',
      'Activer la musique par défaut': 'Enable music by default',
      'Langue de l’interface': 'Interface language',
      'Enregistrer les paramètres': 'Save settings',
      'Français': 'French',
      'English': 'English',
      'Contenu': 'Content',
      'Ajouter du contenu': 'Add content',
      'Réglages': 'Settings',
      'Enregistrer': 'Save',
      'Enregistré': 'Saved',
      'Modifications non enregistrées': 'Unsaved changes',
      'Préparer le lancement': 'Prepare launch',
      'Lancer le live': 'Launch live',
      'Commencer le quiz': 'Start quiz',
      'Construisez votre quiz': 'Build your quiz',
      'Ajoutez une question, importez un document ou utilisez l’IA.': 'Add a question, import a document or use AI.',
      'Question': 'Question',
      'Explication': 'Explanation',
      'Facultatif': 'Optional',
      'Supprimer': 'Delete',
      'Nouvelle question': 'New question',
      'Nouvelle slide': 'New slide',
      'Titre de la slide': 'Slide title',
      'Image de remplacement': 'Replacement image',
      'Générer avec l’IA': 'Generate with AI',
      'Thème, niveau et quantité': 'Topic, level and quantity',
      'Banque de questions': 'Question bank',
      'Rechercher et réutiliser': 'Search and reuse',
      'Importer PowerPoint': 'Import PowerPoint',
      'Conversion automatique fidèle': 'Accurate automatic conversion',
      'Importer Excel / CSV': 'Import Excel / CSV',
      'Questions et réponses': 'Questions and answers',
      'Importer un PDF': 'Import a PDF',
      'Une page devient une slide': 'Each page becomes a slide',
      'Importer des images': 'Import images',
      'Timer activé': 'Timer enabled',
      'Animations activées': 'Animations enabled',
      'Musique activée': 'Music enabled',
      'Générer des questions': 'Generate questions',
      'Thème': 'Topic',
      'Nombre': 'Number',
      'Niveau': 'Level',
      'Format': 'Format',
      'Facile': 'Easy',
      'Intermédiaire': 'Intermediate',
      'Difficile': 'Difficult',
      'Générer': 'Generate',
      'En attente de participants': 'Waiting for participants',
      'Participants connectés': 'Connected participants',
      'Copier le lien': 'Copy link',
      'Lien copié': 'Link copied',
      'Précédent': 'Previous',
      'Suivant': 'Next',
      'Aperçu du contenu': 'Content preview',
      'Aucun participant connecté.': 'No participant connected.',
      'Partagez ce code avec vos participants': 'Share this code with your participants',
      'Question en cours': 'Current question',
      'Participants': 'Participants',
      'Classement': 'Leaderboard',
      'Pas encore de classement': 'No leaderboard yet',
      'En attente de participants...': 'Waiting for participants...',
      'Répondre': 'Answer',
      'Réponse envoyée': 'Answer submitted',
      'En attente de la prochaine question': 'Waiting for the next question',
      'Quiz terminé': 'Quiz finished',
      'Votre score': 'Your score',
      'Bonne réponse': 'Correct answer',
      'Mauvaise réponse': 'Wrong answer',
      'Espace entreprise': 'Company workspace',
      'Groupes': 'Groups',
      'Utilisateurs': 'Users',
      'Créer le groupe': 'Create group',
      'Créer': 'Create',
      'Rejoindre une entreprise': 'Join a company',
      'Code d’invitation': 'Invitation code',
      'Générer un accès': 'Generate access',
      'Comptes utilisés': 'Accounts used',
      'Groupes créés': 'Groups created',
      'Propriétaire': 'Owner',
      'Membre': 'Member',
      'Retirer': 'Remove',
      'Aucun quiz créé.': 'No quiz created.',
      'Aucun contenu': 'No content',
      'Aucune organisation créée.': 'No organization created.',
      'Aucun groupe créé.': 'No group created.',
      'Chargement…': 'Loading…',
      'Chargement de votre espace…': 'Loading your workspace…',
      'En cours': 'Live',
      'Terminé': 'Finished',
      'En préparation': 'Draft'
    }
  };

  const placeholders = {
    en: {
      'Votre nom': 'Your name',
      'Votre pseudo': 'Your nickname',
      'email@exemple.com': 'email@example.com',
      '8 caractères minimum': '8 characters minimum',
      'Ex: ABC123': 'E.g. ABC123',
      'Rechercher par nom ou code': 'Search by name or code',
      'Rechercher un quiz ou un code': 'Search a quiz or code',
      'Nom du groupe': 'Group name',
      'Code d’invitation': 'Invitation code',
      'Nom de l’entreprise': 'Company name',
      'Ex. Histoire de France': 'E.g. History of France',
      'Votre question ouverte': 'Your open question',
      'Quiz sans titre': 'Untitled quiz'
    }
  };

  const dynamicRules = [
    [/^(\d+) participant(s?)$/i, (_, n) => `${n} participant${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) question(s?)$/i, (_, n) => `${n} question${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) slide(s?)$/i, (_, n) => `${n} slide${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) quiz$/i, (_, n) => `${n} quiz`],
    [/^(\d+) élément(s?)$/i, (_, n) => `${n} item${Number(n) === 1 ? '' : 's'}`],
    [/^Code ([A-Z0-9]{6})$/i, (_, code) => `Code ${code}`],
    [/^Compte connecté : (.+)$/i, (_, value) => `Signed in: ${value}`],
    [/^Jusqu'à (\d+) participants$/i, (_, n) => `Up to ${n} participants`],
    [/^(\d+) participants maximum par session$/i, (_, n) => `${n} participants maximum per session`]
  ];

  let language = normalize(localStorage.getItem(STORAGE_KEY) || document.documentElement.lang || navigator.language);
  let observer = null;
  let translating = false;

  function normalize(value) {
    const lang = String(value || '').toLowerCase().slice(0, 2);
    return SUPPORTED.includes(lang) ? lang : 'fr';
  }

  function translateString(value) {
    if (language === 'fr') return value;
    const source = String(value || '').trim();
    if (!source) return value;
    const translated = exact.en[source];
    if (translated) return String(value).replace(source, translated);
    for (const [pattern, handler] of dynamicRules) {
      const match = source.match(pattern);
      if (match) return String(value).replace(source, handler(...match));
    }
    return value;
  }

  function translateTextNode(node) {
    if (!node?.nodeValue || !node.parentElement) return;
    if (['SCRIPT','STYLE','TEXTAREA','OPTION'].includes(node.parentElement.tagName)) return;
    const original = node.nodeValue;
    if (!node.__qlOriginal) node.__qlOriginal = original;
    node.nodeValue = language === 'fr' ? node.__qlOriginal : translateString(node.__qlOriginal);
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    if (element.matches('input, textarea')) {
      if (!element.dataset.qlOriginalPlaceholder && element.placeholder) element.dataset.qlOriginalPlaceholder = element.placeholder;
      const source = element.dataset.qlOriginalPlaceholder || '';
      element.placeholder = language === 'fr' ? source : (placeholders.en[source] || translateString(source));
      if (element.type === 'button' || element.type === 'submit') {
        if (!element.dataset.qlOriginalValue) element.dataset.qlOriginalValue = element.value;
        element.value = language === 'fr' ? element.dataset.qlOriginalValue : translateString(element.dataset.qlOriginalValue);
      }
    }
    if (element.hasAttribute('title')) {
      if (!element.dataset.qlOriginalTitle) element.dataset.qlOriginalTitle = element.title;
      element.title = language === 'fr' ? element.dataset.qlOriginalTitle : translateString(element.dataset.qlOriginalTitle);
    }
    for (const node of element.childNodes) if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    element.querySelectorAll('*').forEach(child => {
      for (const node of child.childNodes) if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      if (child.matches('input, textarea')) translateElement(child);
    });
  }

  function translatePage() {
    if (translating || !document.body) return;
    translating = true;
    document.documentElement.lang = language;
    translateElement(document.body);
    document.title = language === 'en' ? document.title
      .replace('Mon espace', 'My workspace')
      .replace('Éditeur de quiz', 'Quiz editor')
      .replace('Administration', 'Administration')
      .replace('Quiz Interactif en Direct', 'Live Interactive Quiz') : document.title;
    document.querySelectorAll('[data-ql-language]').forEach(button => button.classList.toggle('active', button.dataset.qlLanguage === language));
    translating = false;
  }

  async function saveToProfile(lang) {
    try {
      const user = window.firebase?.auth?.().currentUser;
      if (user && !user.isAnonymous && window.database) {
        await database.ref(`organizers/${user.uid}/settings/language`).set(lang);
      }
    } catch (error) {
      console.warn('QuizLive language profile save:', error);
    }
  }

  function setLanguage(value, options = {}) {
    const next = normalize(value);
    language = next;
    localStorage.setItem(STORAGE_KEY, next);
    translatePage();
    document.dispatchEvent(new CustomEvent('quizlive:languagechange', { detail: { language: next } }));
    if (options.saveProfile !== false) saveToProfile(next);
  }

  function createSwitcher() {
    if (document.getElementById('quizliveLanguageSwitcher')) return;
    const box = document.createElement('div');
    box.id = 'quizliveLanguageSwitcher';
    box.className = 'ql-language-switcher';
    box.setAttribute('aria-label', 'Language');
    box.innerHTML = '<button type="button" data-ql-language="fr">FR</button><button type="button" data-ql-language="en">EN</button>';
    box.querySelectorAll('button').forEach(button => button.onclick = () => setLanguage(button.dataset.qlLanguage));
    document.body.appendChild(box);
  }

  function bindExistingLanguageSelects() {
    document.querySelectorAll('#settingLanguage, [data-language-select]').forEach(select => {
      select.value = language;
      if (select.dataset.qlBound) return;
      select.dataset.qlBound = '1';
      select.addEventListener('change', () => setLanguage(select.value));
    });
  }

  function start() {
    createSwitcher();
    bindExistingLanguageSelects();
    translatePage();
    observer = new MutationObserver(mutations => {
      if (translating) return;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) translateElement(node);
        });
      }
      bindExistingLanguageSelects();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (window.firebase?.auth) {
      firebase.auth().onAuthStateChanged(async user => {
        if (!user || user.isAnonymous || !window.database) return;
        try {
          const snap = await database.ref(`organizers/${user.uid}/settings/language`).once('value');
          if (snap.exists() && !localStorage.getItem(STORAGE_KEY)) setLanguage(snap.val(), { saveProfile: false });
        } catch (_) {}
      });
    }
  }

  const style = document.createElement('style');
  style.textContent = '.ql-language-switcher{position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;padding:4px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(15,23,42,.92);backdrop-filter:blur(12px);box-shadow:0 10px 30px rgba(0,0,0,.25)}.ql-language-switcher button{border:0;background:transparent;color:#94a3b8;padding:7px 10px;border-radius:999px;font:700 12px/1 Outfit,sans-serif;cursor:pointer}.ql-language-switcher button.active{background:#6366f1;color:#fff}@media(max-width:640px){.ql-language-switcher{right:10px;bottom:10px}}';
  document.head.appendChild(style);

  window.QuizI18n = { setLanguage, getLanguage: () => language, t: translateString, translatePage };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
