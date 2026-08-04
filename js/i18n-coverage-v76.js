// QuizLive — couverture i18n complémentaire pour les textes dynamiques et mixtes.
(() => {
  'use strict';

  if (window.QuizI18nCoverage?.version === '76') return;

  const EXTRA_PAIRS = [
    ['Connexion', 'Sign in'],
    ['Rejoindre le Quiz', 'Join the Quiz'],
    ['Navigation organisateur', 'Organizer navigation'],
    ['Ouvrir le menu', 'Open menu'],
    ['Calcul des statistiques…', 'Calculating statistics…'],
    ['Calcul des statistiques...', 'Calculating statistics...'],
    ['Chargement des quiz…', 'Loading quizzes…'],
    ['Chargement des quiz...', 'Loading quizzes...'],
    ['Informations du compte organisateur connecté.', 'Information for the signed-in organizer account.'],
    ['Compte organisateur introuvable ou inactif.', 'Organizer account not found or inactive.'],
    ['Impossible de charger votre espace.', 'Unable to load your workspace.'],
    ['Compte non connecté.', 'Account not signed in.'],
    ['Compte organisateur requis.', 'Organizer account required.'],
    ['Service indisponible.', 'Service unavailable.'],
    ['Sélectionner les images', 'Select images'],
    ['Sélectionner le fichier', 'Select file'],
    ['Sélectionner', 'Select'],
    ['Choisir', 'Choose'],
    ['Aucun fichier sélectionné', 'No file selected'],
    ['Aucun fichier choisi', 'No file chosen'],
    ['(glisser-déposer)', '(drag and drop)'],
    ['+ Ajouter une question', '+ Add a question'],
    ['Sauvegardez vos questions et slides pour les réutiliser plus tard.', 'Save your questions and slides to reuse them later.'],
    ['Ex: Quelle est la capitale de la France ?', 'E.g. What is the capital of France?'],
    ['Ex. Quelle est la capitale de la France ?', 'E.g. What is the capital of France?'],
    ['Première réponse', 'First answer'],
    ['Deuxième réponse', 'Second answer'],
    ['Troisième réponse', 'Third answer'],
    ['Quatrième réponse', 'Fourth answer'],
    ['Bonne réponse', 'Correct answer'],
    ['Réponse correcte', 'Correct answer'],
    ['Réponses', 'Answers'],
    ['Résultats', 'Results'],
    ['Afficher les résultats', 'Show results'],
    ['Masquer les résultats', 'Hide results'],
    ['Afficher la réponse', 'Show answer'],
    ['Question précédente', 'Previous question'],
    ['Question suivante', 'Next question'],
    ['Démarrer', 'Start'],
    ['Arrêter', 'Stop'],
    ['Quitter', 'Leave'],
    ['Accueil', 'Home'],
    ['Temps restant', 'Time remaining'],
    ['Temps écoulé !', 'Time is up!'],
    ['Le quiz commence !', 'The quiz is starting!'],
    ['Votre classement', 'Your ranking'],
    ['Voir le classement', 'View leaderboard'],
    ['Félicitations !', 'Congratulations!'],
    ['Réessayer', 'Try again'],
    ['Retourner à l’accueil', 'Return to home'],
    ["Retourner à l'accueil", 'Return to home'],
    ['Êtes-vous sûr de vouloir quitter cette session ?', 'Are you sure you want to leave this session?'],
    ['Session créée avec succès!', 'Session created successfully!'],
    ['Session créée avec succès !', 'Session created successfully!'],
    ['Veuillez remplir tous les champs', 'Please complete all fields'],
    ['Veuillez remplir tous les champs.', 'Please complete all fields.'],
    ['Vous devez être connecté en admin', 'You must be signed in as an admin'],
    ['Vous devez être connecté en admin.', 'You must be signed in as an admin.'],
    ['Ordre mis à jour', 'Order updated'],
    ['Modification enregistrée.', 'Change saved.'],
    ['Modifications enregistrées.', 'Changes saved.'],
    ['Enregistrement impossible.', 'Unable to save.'],
    ['Erreur lors de la sauvegarde', 'Error while saving'],
    ['Erreur lors de l’import', 'Import error'],
    ['Import terminé.', 'Import completed.'],
    ['Aucune question à importer.', 'No questions to import.'],
    ['Fichier invalide.', 'Invalid file.'],
    ['Format non pris en charge.', 'Unsupported format.'],
    ['Aucune réponse', 'No answer'],
    ['Sans titre', 'Untitled'],
    ['Quiz sans titre', 'Untitled quiz'],
    ['Question sans titre', 'Untitled question'],
    ['Slide sans titre', 'Untitled slide'],
    ['Aucun participant', 'No participants'],
    ['Aucune réponse enregistrée.', 'No recorded answers.'],
    ['En attente du démarrage du quiz...', 'Waiting for the quiz to start...'],
    ['En attente du lancement...', 'Waiting to start...'],
    ['Connexion perdue', 'Connection lost'],
    ['Reconnexion...', 'Reconnecting...'],
    ['Reconnexion…', 'Reconnecting…'],
    ['Connexion rétablie', 'Connection restored'],
    ['Session introuvable', 'Session not found'],
    ['Code invalide', 'Invalid code'],
    ['Code de session invalide', 'Invalid session code'],
    ['Ce quiz n’existe pas.', 'This quiz does not exist.'],
    ['Ce quiz est terminé.', 'This quiz has ended.'],
    ['Impossible de rejoindre le quiz.', 'Unable to join the quiz.'],
    ['Impossible de créer le quiz.', 'Unable to create the quiz.'],
    ['Impossible de charger les quiz du groupe.', 'Unable to load the group quizzes.'],
    ['Impossible de charger les quiz.', 'Unable to load quizzes.'],
    ['Impossible de charger les données.', 'Unable to load data.'],
    ['Action impossible.', 'Unable to complete the action.'],
    ['Modification impossible.', 'Unable to make the change.'],
    ['Attribution impossible.', 'Unable to assign.'],
    ['Suppression annulée.', 'Deletion canceled.'],
    ['Choisis un groupe.', 'Choose a group.'],
    ['Choisissez un groupe.', 'Choose a group.'],
    ['Quiz personnel — visible uniquement par moi', 'Personal quiz — visible only to me'],
    ['Tous les membres de ce groupe verront et pourront ouvrir ce quiz.', 'All members of this group will be able to view and open this quiz.'],
    ['Tous les membres du groupe voient les mêmes quiz, quel que soit leur créateur.', 'All group members see the same quizzes, regardless of who created them.'],
    ['Attribuer mes quiz à un groupe', 'Assign my quizzes to a group'],
    ['Choisis le groupe qui pourra voir et utiliser chaque quiz.', 'Choose the group that can view and use each quiz.'],
    ['Aucun quiz personnel à attribuer.', 'No personal quiz to assign.'],
    ['Privé', 'Private'],
    ['Attribuer', 'Assign'],
    ['Affectation', 'Assignment'],
    ['Groupe actuel', 'Current group'],
    ['Nouveau groupe', 'New group'],
    ['Modifier le groupe', 'Change group'],
    ['Déplacer', 'Move'],
    ['Suppression définitive', 'Permanent deletion'],
    ['Cette action est irréversible.', 'This action cannot be undone.'],
    ['Le quiz et toutes ses données seront supprimés.', 'The quiz and all its data will be deleted.'],
    ['Gestion des accès', 'Access management'],
    ['Ajouter un membre', 'Add a member'],
    ['Aucun membre actif.', 'No active member.'],
    ['Aucune invitation en attente.', 'No pending invitation.'],
    ['Supprimer l’invitation', 'Delete invitation'],
    ['Retirer le membre', 'Remove member'],
    ['Limite de comptes atteinte.', 'Account limit reached.'],
    ['Nom du collaborateur', 'Team member name'],
    ['Adresse du collaborateur', 'Team member address'],
    ['Rôle', 'Role'],
    ['Date d’ajout', 'Date added'],
    ['Date de création', 'Creation date'],
    ['Dernière modification', 'Last modified'],
    ['Aujourd’hui', 'Today'],
    ['Hier', 'Yesterday'],
    ['Aucun résultat trouvé.', 'No results found.'],
    ['Réinitialiser', 'Reset'],
    ['Actualiser', 'Refresh'],
    ['Précédente', 'Previous'],
    ['Suivante', 'Next'],
    ['Page suivante', 'Next page'],
    ['Page précédente', 'Previous page'],
    ['Voir plus', 'View more'],
    ['Voir moins', 'View less'],
    ['Détails', 'Details'],
    ['Copié !', 'Copied!'],
    ['Lien copié dans le presse-papiers.', 'Link copied to clipboard.'],
    ['Téléchargement terminé.', 'Download completed.'],
    ['Téléchargement impossible.', 'Unable to download.'],
    ['Adresse e-mail requise.', 'Email address required.'],
    ['Mot de passe requis.', 'Password required.'],
    ['Nom requis.', 'Name required.'],
    ['Adresse e-mail incorrecte.', 'Invalid email address.'],
    ['Mot de passe incorrect.', 'Incorrect password.'],
    ['Compte introuvable.', 'Account not found.'],
    ['Cette adresse e-mail est déjà utilisée.', 'This email address is already in use.'],
    ['Trop de tentatives. Réessayez plus tard.', 'Too many attempts. Please try again later.'],
    ['Connexion impossible.', 'Unable to sign in.'],
    ['Création du compte impossible.', 'Unable to create the account.'],
    ['Réinitialisation impossible.', 'Unable to reset the password.'],
    ['Email de réinitialisation envoyé !', 'Password reset email sent!'],
    ['Une erreur est survenue.', 'An error occurred.'],
    ['Réessayer plus tard.', 'Please try again later.']
  ];

  const frToEn = new Map(EXTRA_PAIRS);
  const enToFr = new Map(EXTRA_PAIRS.map(([fr, en]) => [en, fr]));
  const textState = new WeakMap();
  const attributeState = new WeakMap();
  let applying = false;
  let observer = null;

  const inlinePairs = [
    [' · créé par ', ' · created by '],
    [' · Créé par ', ' · Created by '],
    ['créé par ', 'created by '],
    ['Créé par ', 'Created by '],
    [' éléments', ' items'],
    [' élément', ' item'],
    [' réponses', ' answers'],
    [' réponse', ' answer'],
    [' questions', ' questions'],
    [' question', ' question'],
    [' comptes', ' accounts'],
    [' compte', ' account'],
    [' groupes', ' groups'],
    [' groupe', ' group'],
    [' membres', ' members'],
    [' membre', ' member'],
    [' invitations', ' invitations'],
    [' invitation', ' invitation'],
    [' par session', ' per session'],
    [' par mois', ' per month'],
    [' /mois', ' /month']
  ];

  function language() {
    return window.QuizI18n?.getLanguage?.() || localStorage.getItem('quizliveLanguage') || 'fr';
  }

  function split(value) {
    const text = String(value ?? '');
    const leading = text.match(/^\s*/)?.[0] || '';
    const trailing = text.match(/\s*$/)?.[0] || '';
    let core = text.slice(leading.length, text.length - trailing.length);
    const emoji = core.match(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u)?.[0] || '';
    core = core.slice(emoji.length);
    return { leading, emoji, core, trailing };
  }

  function replaceAllLiteral(value, from, to) {
    return value.split(from).join(to);
  }

  function translate(value, target = language()) {
    if (value == null) return value;
    const { leading, emoji, core, trailing } = split(value);
    if (!core) return value;

    const exact = target === 'en' ? frToEn.get(core) : enToFr.get(core);
    let result = exact || core;

    if (!exact) {
      const pairs = target === 'en' ? inlinePairs : inlinePairs.map(([fr, en]) => [en, fr]);
      for (const [from, to] of pairs) result = replaceAllLiteral(result, from, to);

      if (target === 'en') {
        result = result
          .replace(/^Erreur lors de (.+)$/i, 'Error while $1')
          .replace(/^Impossible de (.+)$/i, 'Unable to $1')
          .replace(/^Aucun(?:e)? (.+)$/i, 'No $1')
          .replace(/^Supprimer définitivement (.+) \?$/i, 'Permanently delete $1?')
          .replace(/^Êtes-vous sûr(?:e)? de vouloir (.+) \?$/i, 'Are you sure you want to $1?');
      } else {
        result = result
          .replace(/^Error while (.+)$/i, 'Erreur lors de $1')
          .replace(/^Unable to (.+)$/i, 'Impossible de $1')
          .replace(/^Permanently delete (.+)\?$/i, 'Supprimer définitivement $1 ?')
          .replace(/^Are you sure you want to (.+)\?$/i, 'Êtes-vous sûr de vouloir $1 ?');
      }
    }

    return `${leading}${emoji}${result}${trailing}`;
  }

  function skip(element) {
    return !element || Boolean(element.closest('script,style,noscript,code,pre,[contenteditable="true"],[data-i18n-ignore]'));
  }

  function translateText(node) {
    if (!node?.nodeValue || skip(node.parentElement)) return;
    const current = node.nodeValue;
    let state = textState.get(node);
    if (!state || current !== state.rendered) state = { source: current, rendered: current };
    const rendered = translate(state.source);
    if (current !== rendered) node.nodeValue = rendered;
    state.rendered = rendered;
    textState.set(node, state);
  }

  function translateAttribute(element, name) {
    if (!element.hasAttribute(name)) return;
    const current = element.getAttribute(name) || '';
    let states = attributeState.get(element) || {};
    let state = states[name];
    if (!state || current !== state.rendered) state = { source: current, rendered: current };
    const rendered = translate(state.source);
    if (current !== rendered) element.setAttribute(name, rendered);
    state.rendered = rendered;
    states[name] = state;
    attributeState.set(element, states);
  }

  function translateElement(element) {
    if (!(element instanceof Element) || skip(element)) return;
    ['placeholder', 'title', 'aria-label', 'alt'].forEach(name => translateAttribute(element, name));
    for (const child of element.childNodes) if (child.nodeType === Node.TEXT_NODE) translateText(child);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (!(root instanceof Element || root instanceof DocumentFragment || root instanceof Document)) return;
    if (root instanceof Element) translateElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateText(node);
      else translateElement(node);
    }
  }

  function apply() {
    if (applying || !document.body) return;
    applying = true;
    walk(document.body);
    applying = false;
  }

  function patchDialogs() {
    for (const name of ['alert', 'confirm']) {
      const current = window[name];
      if (typeof current !== 'function' || current.__qlCoverageWrapped) continue;
      const wrapped = message => current.call(window, translate(message));
      wrapped.__qlCoverageWrapped = true;
      window[name] = wrapped;
    }

    const prompt = window.prompt;
    if (typeof prompt === 'function' && !prompt.__qlCoverageWrapped) {
      const wrapped = (message, defaultValue) => prompt.call(window, translate(message), defaultValue);
      wrapped.__qlCoverageWrapped = true;
      window.prompt = wrapped;
    }
  }

  function patchToast() {
    const current = window.showToast;
    if (typeof current !== 'function' || current.__qlCoverageWrapped) return;
    const wrapped = function(message, ...args) {
      return current.call(this, translate(message), ...args);
    };
    wrapped.__qlCoverageWrapped = true;
    window.showToast = wrapped;
  }

  function start() {
    patchDialogs();
    patchToast();
    apply();

    observer = new MutationObserver(mutations => {
      if (applying) return;
      applying = true;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateText(mutation.target);
        mutation.addedNodes.forEach(node => walk(node));
        if (mutation.type === 'attributes') translateElement(mutation.target);
      }
      patchToast();
      applying = false;
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'alt']
    });

    document.addEventListener('quizlive:languagechange', apply);
    window.addEventListener('quizlive-language-change', apply);
    setInterval(patchToast, 500);
  }

  window.QuizI18nCoverage = {
    version: '76',
    apply,
    translate,
    dictionary: EXTRA_PAIRS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
