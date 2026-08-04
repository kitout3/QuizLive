// QuizLive — internationalisation globale complète FR / EN
(() => {
  'use strict';

  if (window.QuizI18n?.version === '76') return;

  const STORAGE_KEY = 'quizliveLanguage';
  const SUPPORTED = new Set(['fr', 'en']);
  const textMeta = new WeakMap();
  const attrMeta = new WeakMap();
  let applying = false;
  let observer = null;

  const PAIRS = [
    ['Quiz Interactifs', 'Interactive Quizzes'],
    ['En Temps Réel', 'In Real Time'],
    ['Créez des quiz engageants, nuages de mots et sondages pour captiver votre audience. Résultats instantanés et classements en direct.', 'Create engaging quizzes, word clouds and polls to captivate your audience. Instant results and live rankings.'],
    ['Créer un Quiz', 'Create a Quiz'],
    ['Créer un quiz', 'Create a quiz'],
    ['Créer un nouveau Quiz', 'Create a new Quiz'],
    ['Créer un nouveau quiz', 'Create a new quiz'],
    ['Lancez une nouvelle session interactive', 'Start a new interactive session'],
    ['Rejoindre', 'Join'],
    ['Rejoindre un Quiz', 'Join a Quiz'],
    ['Rejoindre un quiz', 'Join a quiz'],
    ['Rejoindre une session', 'Join a session'],
    ['Participez avec un code de session', 'Join with a session code'],
    ['Espace organisateur', 'Organizer workspace'],
    ['Mon espace', 'My workspace'],
    ['Retour', 'Back'],
    ['Retour accueil', 'Back to home'],
    ['Retour à l’accueil', 'Back to home'],
    ["Retour à l'accueil", 'Back to home'],
    ['Se déconnecter', 'Sign out'],
    ['Fermer', 'Close'],
    ['Annuler', 'Cancel'],
    ['Valider', 'Confirm'],
    ['Continuer', 'Continue'],
    ['Chargement...', 'Loading...'],
    ['Chargement…', 'Loading…'],
    ['Chargement de votre espace…', 'Loading your workspace…'],
    ['Chargement de votre espace...', 'Loading your workspace...'],
    ['Chargement du quiz…', 'Loading quiz…'],
    ['Chargement du quiz...', 'Loading quiz...'],
    ['Chargement de la présentation...', 'Loading presentation...'],
    ['Chargement impossible.', 'Unable to load.'],

    ['Connexion administrateur requise', 'Administrator sign-in required'],
    ['Connexion Admin', 'Admin sign-in'],
    ['Email admin', 'Admin email'],
    ['Email et mot de passe requis.', 'Email and password are required.'],
    ['Adresse e-mail ou mot de passe incorrect.', 'Incorrect email address or password.'],
    ['Nom de votre session', 'Session name'],
    ['Votre pseudo', 'Your nickname'],
    ['Groupe de visibilité', 'Visibility group'],
    ['Les membres du groupe sélectionné verront et pourront modifier ce quiz.', 'Members of the selected group will be able to view and edit this quiz.'],
    ['Quiz personnel — non partagé', 'Personal quiz — not shared'],
    ['Créer la session', 'Create session'],
    ['Code de la session', 'Session code'],
    ['Code de session', 'Session code'],
    ['Participer', 'Join'],
    ['Votre nom', 'Your name'],
    ['Joueur', 'Player'],

    ['Connexion organisateur', 'Organizer sign-in'],
    ['Se connecter', 'Sign in'],
    ['Accédez à votre espace organisateur et à vos quiz.', 'Access your organizer workspace and quizzes.'],
    ['Continuer avec Google', 'Continue with Google'],
    ['G Continuer avec Google', 'G Continue with Google'],
    ['Connexion Google en cours…', 'Signing in with Google…'],
    ['Connexion Google en cours...', 'Signing in with Google...'],
    ['ou', 'or'],
    ['Email', 'Email'],
    ['Adresse email', 'Email address'],
    ['Adresse e-mail', 'Email address'],
    ['Mot de passe', 'Password'],
    ['Votre mot de passe', 'Your password'],
    ['Afficher le mot de passe', 'Show password'],
    ['Masquer le mot de passe', 'Hide password'],
    ['Mot de passe oublié ?', 'Forgot password?'],
    ['Créer un compte', 'Create an account'],
    ['Créer mon compte', 'Create my account'],
    ['Créez votre compte organisateur pour gérer vos quiz.', 'Create your organizer account to manage your quizzes.'],
    ['Créer avec Google', 'Create with Google'],
    ['G Créer avec Google', 'G Create with Google'],
    ['Nom', 'Name'],
    ['8 caractères minimum', '8 characters minimum'],
    ['J’ai déjà un compte', 'I already have an account'],
    ['Mot de passe oublié', 'Forgot password'],
    ['Saisissez l’adresse email de votre compte. Vous recevrez un lien pour définir un nouveau mot de passe.', 'Enter your account email address. You will receive a link to set a new password.'],
    ['Envoyer le lien', 'Send link'],
    ['Retour à la connexion', 'Back to sign in'],
    ['Une erreur est survenue. Réessayez.', 'An error occurred. Please try again.'],
    ['Le service de connexion est indisponible.', 'The sign-in service is unavailable.'],
    ['Renseignez votre nom.', 'Enter your name.'],
    ['Le mot de passe doit contenir au moins 8 caractères.', 'The password must contain at least 8 characters.'],
    ['Un lien de réinitialisation a été envoyé. Vérifiez aussi les courriers indésirables.', 'A reset link has been sent. Please also check your spam folder.'],

    ['Vue d’ensemble', 'Overview'],
    ['Mes quiz', 'My quizzes'],
    ['Historique', 'History'],
    ['Espace entreprise', 'Company workspace'],
    ['Abonnement', 'Subscription'],
    ['Mon profil', 'My profile'],
    ['Paramètres', 'Settings'],
    ['Gérez vos quiz et votre compte organisateur.', 'Manage your quizzes and organizer account.'],
    ['Suivez rapidement l’activité de votre compte QuizLive.', 'Quickly track your QuizLive account activity.'],
    ['Quiz créés', 'Quizzes created'],
    ['Participants cumulés', 'Total participants'],
    ['Réponses enregistrées', 'Recorded answers'],
    ['Taux de réussite', 'Success rate'],
    ['Derniers quiz', 'Recent quizzes'],
    ['Votre compte', 'Your account'],
    ['Organisateur', 'Organizer'],
    ['Aucun quiz créé.', 'No quiz created.'],
    ['Aucun quiz personnel.', 'No personal quiz.'],
    ['Aucun quiz partagé dans vos groupes.', 'No quiz shared in your groups.'],
    ['Retrouvez vos quiz personnels et ceux partagés avec vos groupes.', 'Find your personal quizzes and those shared with your groups.'],
    ['Quiz partagés dans mes groupes', 'Quizzes shared in my groups'],
    ['Tous les membres d’un même groupe voient et peuvent modifier les mêmes quiz.', 'All members of the same group can view and edit the same quizzes.'],
    ['Mes quiz personnels', 'My personal quizzes'],
    ['Nouveau quiz', 'New quiz'],
    ['Ouvrir', 'Open'],
    ['Changer', 'Change'],
    ['Partager', 'Share'],
    ['Partager un quiz personnel', 'Share a personal quiz'],
    ['Attribuez un ancien quiz à un groupe pour le rendre visible aux membres.', 'Assign an existing quiz to a group so members can see it.'],
    ['Choisir un groupe', 'Choose a group'],
    ['Quiz partagé avec le groupe.', 'Quiz shared with the group.'],
    ['Partage impossible.', 'Unable to share.'],
    ['Quiz attribué au groupe.', 'Quiz assigned to the group.'],
    ['Quiz redevenu personnel.', 'Quiz is personal again.'],
    ['Changer de groupe', 'Change group'],
    ['Supprimer définitivement', 'Delete permanently'],
    ['Supprimer le quiz', 'Delete quiz'],
    ['Quiz supprimé.', 'Quiz deleted.'],
    ['Suppression impossible.', 'Unable to delete.'],
    ['Groupe inaccessible.', 'Group unavailable.'],
    ['Quiz introuvable.', 'Quiz not found.'],
    ['Action non autorisée.', 'Action not allowed.'],
    ['Attribution non autorisée.', 'Assignment not allowed.'],
    ['Vous ne pouvez pas modifier l’affectation de ce quiz.', 'You cannot change this quiz assignment.'],
    ['Vous ne pouvez pas retirer ce quiz du groupe.', 'You cannot remove this quiz from the group.'],
    ['Vous ne pouvez pas supprimer ce quiz.', 'You cannot delete this quiz.'],
    ['Aucun groupe ne vous est actuellement attribué.', 'No group is currently assigned to you.'],
    ['Quiz de groupe', 'Group quizzes'],

    ['Informations personnelles', 'Personal information'],
    ['Modifiez les informations visibles de votre compte organisateur.', 'Edit the visible information of your organizer account.'],
    ['Nom affiché', 'Display name'],
    ['Méthode de connexion', 'Sign-in method'],
    ['Email et mot de passe', 'Email and password'],
    ['Enregistrer les modifications', 'Save changes'],
    ['Le nom doit contenir au moins 2 caractères.', 'The name must contain at least 2 characters.'],
    ['Profil mis à jour.', 'Profile updated.'],
    ['Impossible de modifier le profil.', 'Unable to update the profile.'],
    ['Organisation', 'Organization'],
    ['Créez votre organisation et choisissez celle utilisée par défaut.', 'Create your organization and choose the default one.'],
    ['Mes organisations', 'My organizations'],
    ['Principale', 'Primary'],
    ['Aucune organisation créée.', 'No organization created.'],
    ['Définir comme organisation principale', 'Set as primary organization'],
    ['Créer une organisation', 'Create an organization'],
    ['Nom de l’entreprise, école ou association', 'Company, school or association name'],
    ['Type', 'Type'],
    ['Entreprise', 'Company'],
    ['École', 'School'],
    ['Association', 'Association'],
    ['Créer l’organisation', 'Create organization'],
    ['Sélectionnez une organisation.', 'Select an organization.'],
    ['Organisation principale mise à jour.', 'Primary organization updated.'],
    ['Informations de l’organisation invalides.', 'Invalid organization information.'],
    ['Organisation créée.', 'Organization created.'],
    ['Impossible de créer l’organisation.', 'Unable to create the organization.'],
    ['Retrouvez toutes vos sessions et exportez leur synthèse.', 'Find all your sessions and export their summary.'],
    ['Chargement de l’historique…', 'Loading history…'],
    ['Rechercher un quiz ou un code', 'Search a quiz or code'],
    ['Exporter CSV', 'Export CSV'],
    ['Aucune session correspondante.', 'No matching session.'],
    ['Personnalisez le comportement par défaut de votre compte.', 'Customize your account default behavior.'],
    ['Préférences des nouveaux quiz', 'New quiz preferences'],
    ['Activer le timer par défaut', 'Enable timer by default'],
    ['Activer les animations par défaut', 'Enable animations by default'],
    ['Activer la musique par défaut', 'Enable music by default'],
    ['Langue de l’interface', 'Interface language'],
    ['Français', 'French'],
    ['Enregistrer les paramètres', 'Save settings'],
    ['Paramètres enregistrés.', 'Settings saved.'],

    ['Choisissez votre capacité maximale de participants par session.', 'Choose your maximum participant capacity per session.'],
    ['Abonnement introuvable pour ce compte', 'Subscription not found for this account'],
    ['Plan', 'Plan'],
    ['Statut', 'Status'],
    ['non renseigné', 'not specified'],
    ['Offre actuelle', 'Current plan'],
    ['Choisir cette offre', 'Choose this plan'],
    ['participants maximum par session', 'maximum participants per session'],
    ['Gratuit', 'Free'],
    ['Actif', 'Active'],
    ['Inactif', 'Inactive'],
    ['Annulé', 'Canceled'],

    ['Groupes', 'Groups'],
    ['Utilisateurs', 'Users'],
    ['Membres', 'Members'],
    ['Membres actifs', 'Active members'],
    ['Accès actif', 'Active access'],
    ['Invitations en attente', 'Pending invitations'],
    ['En attente de connexion', 'Waiting for sign-in'],
    ['Inviter', 'Invite'],
    ['Adresse e-mail du collaborateur', 'Team member email address'],
    ['Créer le groupe', 'Create group'],
    ['Créer un groupe', 'Create a group'],
    ['Nom du groupe', 'Group name'],
    ['Supprimer le groupe', 'Delete group'],
    ['Groupe supprimé.', 'Group deleted.'],
    ['Invitation supprimée. Cette adresse peut être invitée de nouveau.', 'Invitation deleted. This address can be invited again.'],
    ['Accès supprimé. Cette personne peut être invitée de nouveau.', 'Access removed. This person can be invited again.'],
    ['Invitation impossible.', 'Unable to send invitation.'],
    ['Invitation enregistrée.', 'Invitation saved.'],
    ['Cette adresse appartient déjà à un membre de l’entreprise.', 'This address already belongs to a company member.'],
    ['Une invitation est déjà en attente pour cette adresse.', 'An invitation is already pending for this address.'],
    ['Adresse e-mail invalide.', 'Invalid email address.'],
    ['Groupe introuvable.', 'Group not found.'],
    ['Seul le propriétaire peut inviter un collaborateur.', 'Only the owner can invite a team member.'],
    ['Cette entreprise a atteint sa limite de comptes.', 'This company has reached its account limit.'],
    ['Le groupe lié à cette invitation n’existe plus.', 'The group linked to this invitation no longer exists.'],
    ['Propriétaire', 'Owner'],
    ['Membre', 'Member'],
    ['Comptes et invitations', 'Accounts and invitations'],
    ['Comptes utilisés', 'Accounts used'],
    ['Groupes créés', 'Groups created'],
    ['Rejoindre une entreprise', 'Join a company'],
    ['Code d’invitation', 'Invitation code'],
    ['Générer un accès', 'Generate access'],
    ['Aucun groupe créé.', 'No group created.'],
    ['Aucun groupe Enterprise ne vous est attribué.', 'No Enterprise group is assigned to you.'],
    ['Vous n’avez pas accès à ce groupe.', 'You do not have access to this group.'],
    ['Un membre Enterprise doit créer le quiz dans un groupe.', 'An Enterprise member must create the quiz in a group.'],

    ['Administration', 'Administration'],
    ['Présentation', 'Presentation'],
    ['En direct', 'Live'],
    ['Quitter la session', 'Leave session'],
    ['Partagez ce code avec vos participants', 'Share this code with your participants'],
    ['Questions & Slides', 'Questions & Slides'],
    ['glisser-déposer', 'drag and drop'],
    ['Ajouter une question', 'Add a question'],
    ['Importer des slides', 'Import slides'],
    ['Importer Excel', 'Import Excel'],
    ['Sauvegarder / Charger', 'Save / Load'],
    ['Question en cours', 'Current question'],
    ['Participants', 'Participants'],
    ['Classement', 'Leaderboard'],
    ['En attente de participants...', 'Waiting for participants...'],
    ['Pas encore de classement', 'No leaderboard yet'],
    ['Nouvelle question', 'New question'],
    ['QCM', 'Multiple choice'],
    ['Vrai/Faux', 'True/False'],
    ['Nuage de mots', 'Word cloud'],
    ['Texte de la question', 'Question text'],
    ['Ajouter la question', 'Add question'],
    ['Modifier la question', 'Edit question'],
    ['Importer des questions depuis Excel', 'Import questions from Excel'],
    ['Format du fichier Excel attendu :', 'Expected Excel file format:'],
    ['Question', 'Question'],
    ['Réponse 1', 'Answer 1'],
    ['Réponse 2', 'Answer 2'],
    ['Réponse 3', 'Answer 3'],
    ['Réponse 4', 'Answer 4'],
    ['Correcte', 'Correct'],
    ['Choisir un fichier Excel', 'Choose an Excel file'],
    ['Sélectionner le fichier', 'Select file'],
    ['Importer des images de vos slides PowerPoint pour les afficher entre les questions.', 'Import images from your PowerPoint slides to display them between questions.'],
    ['Sélectionner des images', 'Select images'],
    ['Sauvegarder la session actuelle', 'Save current session'],
    ['Sauvegarder maintenant', 'Save now'],
    ['Sessions sauvegardées', 'Saved sessions'],
    ['Ajoutez des questions pour commencer', 'Add questions to get started'],
    ['Prêt à lancer le quiz !', 'Ready to start the quiz!'],
    ['Scannez pour rejoindre', 'Scan to join'],
    ['Lancer le Quiz', 'Start Quiz'],
    ['Lancer le quiz', 'Start quiz'],
    ['Question suivante', 'Next question'],
    ['Afficher les résultats', 'Show results'],
    ['Terminer le quiz', 'End quiz'],
    ['Session expirée', 'Session expired'],
    ['Accès refusé : compte admin requis.', 'Access denied: admin account required.'],
    ['Accès refusé : ce quiz ne fait pas partie de vos groupes.', 'Access denied: this quiz is not part of your groups.'],
    ['Connectez-vous avec votre compte organisateur.', 'Sign in with your organizer account.'],
    ['Vous n’avez pas accès à ce quiz.', 'You do not have access to this quiz.'],
    ['Impossible de vérifier votre accès.', 'Unable to verify your access.'],

    ['Jouer', 'Play'],
    ['Mode Présentation', 'Presentation Mode'],
    ['Score:', 'Score:'],
    ['Bienvenue,', 'Welcome,'],
    ['Connexion au quiz...', 'Connecting to quiz...'],
    ['Répondre', 'Answer'],
    ['Réponse envoyée', 'Answer submitted'],
    ['En attente de la prochaine question', 'Waiting for the next question'],
    ['En attente de la prochaine question...', 'Waiting for the next question...'],
    ['Quiz terminé', 'Quiz finished'],
    ['Votre score', 'Your score'],
    ['Bonne réponse', 'Correct answer'],
    ['Mauvaise réponse', 'Wrong answer'],
    ['Temps écoulé', 'Time is up'],
    ['En attente du lancement du quiz...', 'Waiting for the quiz to start...'],
    ['Le quiz va bientôt commencer', 'The quiz will start soon'],
    ['Session introuvable ou accès refusé', 'Session not found or access denied'],
    ['Pseudo invalide', 'Invalid nickname'],
    ['Veuillez remplir tous les champs', 'Please complete all fields'],
    ['Session complète', 'Session full'],
    ['Ce pseudo est déjà utilisé', 'This nickname is already in use'],
    ['Erreur lors de la connexion', 'Sign-in error'],
    ['Erreur lors de la création', 'Creation error'],
    ['Erreur', 'Error'],
    ['Succès', 'Success'],

    ['Contenu', 'Content'],
    ['Ajouter du contenu', 'Add content'],
    ['Réglages', 'Settings'],
    ['Enregistrer', 'Save'],
    ['Enregistré', 'Saved'],
    ['Modifications non enregistrées', 'Unsaved changes'],
    ['Préparer le lancement', 'Prepare launch'],
    ['Lancer le live', 'Launch live'],
    ['Commencer le quiz', 'Start quiz'],
    ['Construisez votre quiz', 'Build your quiz'],
    ['Ajoutez une question, importez un document ou utilisez l’IA.', 'Add a question, import a document or use AI.'],
    ['Explication', 'Explanation'],
    ['Facultatif', 'Optional'],
    ['Nouvelle slide', 'New slide'],
    ['Titre de la slide', 'Slide title'],
    ['Image de remplacement', 'Replacement image'],
    ['Générer avec l’IA', 'Generate with AI'],
    ['Thème, niveau et quantité', 'Topic, level and quantity'],
    ['Banque de questions', 'Question bank'],
    ['Rechercher et réutiliser', 'Search and reuse'],
    ['Importer PowerPoint', 'Import PowerPoint'],
    ['Conversion automatique fidèle', 'Accurate automatic conversion'],
    ['Importer Excel / CSV', 'Import Excel / CSV'],
    ['Questions et réponses', 'Questions and answers'],
    ['Importer un PDF', 'Import a PDF'],
    ['Une page devient une slide', 'Each page becomes a slide'],
    ['Importer des images', 'Import images'],
    ['Timer activé', 'Timer enabled'],
    ['Animations activées', 'Animations enabled'],
    ['Musique activée', 'Music enabled'],
    ['Générer des questions', 'Generate questions'],
    ['Thème', 'Topic'],
    ['Nombre', 'Number'],
    ['Niveau', 'Level'],
    ['Format', 'Format'],
    ['Facile', 'Easy'],
    ['Intermédiaire', 'Intermediate'],
    ['Difficile', 'Difficult'],
    ['Générer', 'Generate'],
    ['Copier le lien', 'Copy link'],
    ['Lien copié', 'Link copied'],
    ['Précédent', 'Previous'],
    ['Suivant', 'Next'],
    ['Aperçu du contenu', 'Content preview'],
    ['Aucun participant connecté.', 'No participant connected.'],
    ['Aucun contenu', 'No content'],

    ['Supprimer', 'Delete'],
    ['Retirer', 'Remove'],
    ['Modifier', 'Edit'],
    ['Ajouter', 'Add'],
    ['Créer', 'Create'],
    ['Copier', 'Copy'],
    ['Télécharger', 'Download'],
    ['Importer', 'Import'],
    ['Rechercher', 'Search'],
    ['Oui', 'Yes'],
    ['Non', 'No'],
    ['En cours', 'Live'],
    ['Terminé', 'Finished'],
    ['En préparation', 'Draft'],
    ['En attente', 'Pending'],
    ['Aucun résultat.', 'No results.'],
    ['Aucune donnée.', 'No data.']
  ];

  const TITLE_PAIRS = [
    ['QuizLive - Quiz Interactif en Direct', 'QuizLive - Live Interactive Quiz'],
    ['Mon espace — QuizLive', 'My workspace — QuizLive'],
    ['QuizLive - Administration', 'QuizLive - Administration'],
    ['QuizLive - Jouer', 'QuizLive - Play'],
    ['QuizLive - Mode Présentation', 'QuizLive - Presentation Mode'],
    ['Connexion organisateur - QuizLive', 'Organizer sign-in - QuizLive'],
    ['Créer un compte organisateur - QuizLive', 'Create an organizer account - QuizLive'],
    ['Mot de passe oublié - QuizLive', 'Forgot password - QuizLive']
  ];

  const frToEn = new Map(PAIRS);
  const enToFr = new Map(PAIRS.map(([fr, en]) => [en, fr]));
  const titleFrToEn = new Map(TITLE_PAIRS);
  const titleEnToFr = new Map(TITLE_PAIRS.map(([fr, en]) => [en, fr]));

  const dynamicToEnglish = [
    [/^(\d+) participant(?:s)?$/i, (_, n) => `${n} participant${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) question(?:s)?$/i, (_, n) => `${n} question${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) slide(?:s)?$/i, (_, n) => `${n} slide${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) élément(?:s)?$/i, (_, n) => `${n} item${Number(n) === 1 ? '' : 's'}`],
    [/^(\d+) quiz$/i, (_, n) => `${n} quiz`],
    [/^créé par (.+)$/i, (_, value) => `created by ${value}`],
    [/^Code ([A-Z0-9-]+)$/i, (_, code) => `Code ${code}`],
    [/^Compte connecté : (.+)$/i, (_, value) => `Signed in: ${value}`],
    [/^Jusqu[’']à (\d+) participants$/i, (_, n) => `Up to ${n} participants`],
    [/^(\d+) participants maximum par session$/i, (_, n) => `${n} participants maximum per session`],
    [/^Question (\d+) \/ (\d+)$/i, (_, a, b) => `Question ${a} / ${b}`],
    [/^Question (\d+) sur (\d+)$/i, (_, a, b) => `Question ${a} of ${b}`],
    [/^(\d+) réponse(?:s)?$/i, (_, n) => `${n} answer${Number(n) === 1 ? '' : 's'}`],
    [/^Invitation enregistrée pour (.+)\.$/i, (_, email) => `Invitation saved for ${email}.`],
    [/^Accès au groupe (.+) activé\.$/i, (_, group) => `Access to group ${group} activated.`],
    [/^Retirer (.+) du groupe (.+) \?$/i, (_, member, group) => `Remove ${member} from group ${group}?`],
    [/^Supprimer l’invitation envoyée à (.+) \?$/i, (_, email) => `Delete the invitation sent to ${email}?`],
    [/^Supprimer définitivement le groupe « (.+) » \?$/i, (_, group) => `Permanently delete group “${group}”?`],
    [/^Supprimer définitivement le quiz « (.+) » \?$/i, (_, quiz) => `Permanently delete quiz “${quiz}”?`]
  ];

  const dynamicToFrench = [
    [/^(\d+) item(?:s)?$/i, (_, n) => `${n} élément${Number(n) === 1 ? '' : 's'}`],
    [/^created by (.+)$/i, (_, value) => `créé par ${value}`],
    [/^Signed in: (.+)$/i, (_, value) => `Compte connecté : ${value}`],
    [/^Up to (\d+) participants$/i, (_, n) => `Jusqu’à ${n} participants`],
    [/^(\d+) participants maximum per session$/i, (_, n) => `${n} participants maximum par session`],
    [/^Question (\d+) of (\d+)$/i, (_, a, b) => `Question ${a} sur ${b}`],
    [/^(\d+) answer(?:s)?$/i, (_, n) => `${n} réponse${Number(n) === 1 ? '' : 's'}`],
    [/^Invitation saved for (.+)\.$/i, (_, email) => `Invitation enregistrée pour ${email}.`],
    [/^Access to group (.+) activated\.$/i, (_, group) => `Accès au groupe ${group} activé.`],
    [/^Remove (.+) from group (.+)\?$/i, (_, member, group) => `Retirer ${member} du groupe ${group} ?`],
    [/^Delete the invitation sent to (.+)\?$/i, (_, email) => `Supprimer l’invitation envoyée à ${email} ?`],
    [/^Permanently delete group “(.+)”\?$/i, (_, group) => `Supprimer définitivement le groupe « ${group} » ?`],
    [/^Permanently delete quiz “(.+)”\?$/i, (_, quiz) => `Supprimer définitivement le quiz « ${quiz} » ?`]
  ];

  function normalizeLanguage(value) {
    const lang = String(value || '').trim().toLowerCase().slice(0, 2);
    return SUPPORTED.has(lang) ? lang : 'fr';
  }

  let language = normalizeLanguage(localStorage.getItem(STORAGE_KEY) || document.documentElement.lang || navigator.language);

  function splitAffixes(value) {
    const text = String(value ?? '');
    const leading = text.match(/^\s*/)?.[0] || '';
    const trailing = text.match(/\s*$/)?.[0] || '';
    let core = text.slice(leading.length, text.length - trailing.length);
    const emoji = core.match(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u)?.[0] || '';
    core = core.slice(emoji.length);
    return { leading, emoji, core, trailing };
  }

  function translateCore(core, targetLanguage) {
    if (!core) return core;
    const exact = targetLanguage === 'en' ? frToEn.get(core) : enToFr.get(core);
    if (exact) return exact;
    const rules = targetLanguage === 'en' ? dynamicToEnglish : dynamicToFrench;
    for (const [pattern, handler] of rules) {
      const match = core.match(pattern);
      if (match) return handler(...match);
    }
    return core;
  }

  function translate(value, targetLanguage = language) {
    if (value == null) return value;
    const { leading, emoji, core, trailing } = splitAffixes(value);
    return `${leading}${emoji}${translateCore(core, targetLanguage)}${trailing}`;
  }

  function shouldSkip(element) {
    if (!element) return true;
    return Boolean(element.closest('script,style,noscript,code,pre,[contenteditable="true"],[data-i18n-ignore]'));
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!node.nodeValue || shouldSkip(parent)) return;
    const current = node.nodeValue;
    let meta = textMeta.get(node);
    if (!meta || current !== meta.rendered) meta = { source: current, rendered: current };
    const rendered = translate(meta.source, language);
    if (current !== rendered) node.nodeValue = rendered;
    meta.rendered = rendered;
    textMeta.set(node, meta);
  }

  const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];

  function translateAttribute(element, attribute) {
    if (!element.hasAttribute(attribute)) return;
    let allMeta = attrMeta.get(element);
    if (!allMeta) {
      allMeta = {};
      attrMeta.set(element, allMeta);
    }
    const current = element.getAttribute(attribute) || '';
    let meta = allMeta[attribute];
    if (!meta || current !== meta.rendered) meta = { source: current, rendered: current };
    const rendered = translate(meta.source, language);
    if (current !== rendered) element.setAttribute(attribute, rendered);
    meta.rendered = rendered;
    allMeta[attribute] = meta;
  }

  function translateElement(element) {
    if (!(element instanceof Element) || shouldSkip(element)) return;
    TRANSLATED_ATTRIBUTES.forEach(attribute => translateAttribute(element, attribute));
    if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) {
      let allMeta = attrMeta.get(element) || {};
      const current = element.value || '';
      let meta = allMeta.value;
      if (!meta || current !== meta.rendered) meta = { source: current, rendered: current };
      const rendered = translate(meta.source, language);
      if (current !== rendered) element.value = rendered;
      meta.rendered = rendered;
      allMeta.value = meta;
      attrMeta.set(element, allMeta);
    }
    for (const child of element.childNodes) if (child.nodeType === Node.TEXT_NODE) translateTextNode(child);
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root);
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return;
    if (root instanceof Element) translateElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateElement(node);
    }
  }

  function translateTitle() {
    const original = document.documentElement.dataset.qlOriginalTitle || document.title;
    if (!document.documentElement.dataset.qlOriginalTitle) document.documentElement.dataset.qlOriginalTitle = original;
    const map = language === 'en' ? titleFrToEn : titleEnToFr;
    document.title = map.get(original) || map.get(document.title) || translate(original, language);
  }

  function updateSwitcher() {
    document.querySelectorAll('[data-ql-language]').forEach(button => {
      const active = button.dataset.qlLanguage === language;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function bindLanguageSelects() {
    document.querySelectorAll('#settingLanguage,[data-language-select]').forEach(select => {
      select.value = language;
      if (select.dataset.qlI18nBound) return;
      select.dataset.qlI18nBound = '1';
      select.addEventListener('change', () => setLanguage(select.value));
    });
  }

  function ensureStyles() {
    if (document.getElementById('quizliveI18nStyles')) return;
    const style = document.createElement('style');
    style.id = 'quizliveI18nStyles';
    style.textContent = '.ql-language-switcher{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:100000;display:flex;gap:2px;padding:4px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(12,13,31,.88);box-shadow:0 12px 35px rgba(0,0,0,.28);backdrop-filter:blur(14px)}.ql-language-switcher button{min-width:34px;height:30px;padding:0 8px;border:0;border-radius:999px;background:transparent;color:#aeb0c7;font:700 12px Outfit,Arial,sans-serif;cursor:pointer}.ql-language-switcher button:hover{color:#fff;background:rgba(255,255,255,.08)}.ql-language-switcher button.active{color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6)}@media(max-width:560px){.ql-language-switcher{right:8px;bottom:8px}.ql-language-switcher button{min-width:31px;height:28px}}';
    document.head.appendChild(style);
  }

  function ensureSwitcher() {
    let box = document.getElementById('quizliveLanguageSwitcher');
    if (!box) {
      box = document.createElement('div');
      box.id = 'quizliveLanguageSwitcher';
      box.className = 'ql-language-switcher';
      box.dataset.i18nIgnore = 'true';
      box.setAttribute('role', 'group');
      box.innerHTML = '<button type="button" data-ql-language="fr" aria-label="Français">FR</button><button type="button" data-ql-language="en" aria-label="English">EN</button>';
      document.body.appendChild(box);
    }
    box.setAttribute('aria-label', language === 'en' ? 'Language' : 'Langue');
    box.querySelectorAll('[data-ql-language]').forEach(button => {
      if (button.dataset.qlI18nBound) return;
      button.dataset.qlI18nBound = '1';
      button.addEventListener('click', () => setLanguage(button.dataset.qlLanguage));
    });
    updateSwitcher();
  }

  function applyPage() {
    if (applying || !document.body) return;
    applying = true;
    document.documentElement.lang = language;
    walk(document.body);
    translateTitle();
    ensureStyles();
    ensureSwitcher();
    bindLanguageSelects();
    applying = false;
  }

  async function saveProfileLanguage(lang) {
    try {
      const auth = window.QuizLiveFirebase?.organizerAuth || window.firebase?.auth?.();
      const db = window.QuizLiveFirebase?.organizerDatabase || window.database;
      const user = auth?.currentUser;
      if (user && !user.isAnonymous && db) await db.ref(`organizers/${user.uid}/settings/language`).set(lang);
    } catch (error) {
      console.warn('QuizLive i18n profile save:', error);
    }
  }

  function setLanguage(value, options = {}) {
    language = normalizeLanguage(value);
    localStorage.setItem(STORAGE_KEY, language);
    applyPage();
    document.dispatchEvent(new CustomEvent('quizlive:languagechange', { detail: { language } }));
    window.dispatchEvent(new CustomEvent('quizlive-language-change', { detail: { language } }));
    if (options.saveProfile !== false) saveProfileLanguage(language);
  }

  function patchDialogs() {
    if (!window.alert.__qlI18nWrapped) {
      const native = window.alert.bind(window);
      const wrapped = message => native(translate(message, language));
      wrapped.__qlI18nWrapped = true;
      window.alert = wrapped;
    }
    if (!window.confirm.__qlI18nWrapped) {
      const native = window.confirm.bind(window);
      const wrapped = message => native(translate(message, language));
      wrapped.__qlI18nWrapped = true;
      window.confirm = wrapped;
    }
    if (!window.prompt.__qlI18nWrapped) {
      const native = window.prompt.bind(window);
      const wrapped = (message, defaultValue) => native(translate(message, language), defaultValue);
      wrapped.__qlI18nWrapped = true;
      window.prompt = wrapped;
    }
  }

  function patchToast() {
    const toast = window.showToast;
    if (typeof toast !== 'function' || toast.__qlI18nWrapped) return;
    const wrapped = function(message, ...args) { return toast.call(this, translate(message, language), ...args); };
    wrapped.__qlI18nWrapped = true;
    window.showToast = wrapped;
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(mutations => {
      if (applying) return;
      applying = true;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTextNode(mutation.target);
        mutation.addedNodes.forEach(node => walk(node));
        if (mutation.type === 'attributes' && mutation.target instanceof Element) translateElement(mutation.target);
      }
      bindLanguageSelects();
      patchToast();
      applying = false;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label', 'alt', 'value'] });
  }

  async function loadProfilePreference(user) {
    if (!user || user.isAnonymous || localStorage.getItem(STORAGE_KEY)) return;
    try {
      const db = window.QuizLiveFirebase?.organizerDatabase || window.database;
      if (!db) return;
      const snap = await db.ref(`organizers/${user.uid}/settings/language`).once('value');
      const saved = snap.val();
      if (SUPPORTED.has(saved)) setLanguage(saved, { saveProfile: false });
    } catch (_) {}
  }

  function start() {
    patchDialogs();
    applyPage();
    startObserver();
    patchToast();
    setInterval(patchToast, 500);
    const auth = window.QuizLiveFirebase?.organizerAuth || window.firebase?.auth?.();
    auth?.onAuthStateChanged?.(loadProfilePreference);
  }

  window.QuizI18n = {
    version: '76',
    t: (value, targetLanguage = language) => translate(value, normalizeLanguage(targetLanguage)),
    translate: (value, targetLanguage = language) => translate(value, normalizeLanguage(targetLanguage)),
    apply: applyPage,
    setLanguage,
    getLanguage: () => language,
    dictionary: PAIRS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
