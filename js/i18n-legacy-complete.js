// Complément FR/EN pour les écrans historiques et les contenus injectés dynamiquement
(() => {
  'use strict';
  const EN = {
    'Créer une session':'Create a session','Nom de la session':'Session name','Nom du quiz':'Quiz name','Créer la session':'Create session',
    'Nouvelle session':'New session','Charger une session':'Load a session','Sauvegarder / Charger':'Save / Load','Sauvegarder maintenant':'Save now',
    'Sessions sauvegardées':'Saved sessions','Aucune session sauvegardée':'No saved session','Charger':'Load','Dupliquer':'Duplicate','Modifier':'Edit',
    'Ajouter une question':'Add a question','Nouvelle question':'New question','Modifier la question':'Edit question','Texte de la question':'Question text',
    'Ajouter la question':'Add question','Enregistrer les modifications':'Save changes','Type de question':'Question type','Bonne réponse':'Correct answer',
    'Réponse 1':'Answer 1','Réponse 2':'Answer 2','Réponse 3':'Answer 3','Réponse 4':'Answer 4','Vrai':'True','Faux':'False',
    'Nuage de mots':'Word cloud','Classement':'Ranking','QCM':'Multiple choice','Questions & Slides':'Questions & Slides',
    'Importer des slides':'Import slides','Importer des questions depuis Excel':'Import questions from Excel','Choisir un fichier Excel':'Choose an Excel file',
    'Sélectionner le fichier':'Select file','Sélectionner les images':'Select images','Importer un PowerPoint, PDF ou des images':'Import a PowerPoint, PDF or images',
    'Conversion en cours...':'Conversion in progress...','Aucune slide générée':'No slide generated','Aucune question ajoutée':'No question added',
    'Question en cours':'Current question','En attente de participants...':'Waiting for participants...','Pas encore de classement':'No leaderboard yet',
    'Participants':'Participants','participants':'participants','En direct':'Live','Présentation':'Presentation','Quitter la session':'Leave session',
    'Lancer le quiz':'Start quiz','Commencer le quiz':'Start quiz','Question suivante':'Next question','Afficher les résultats':'Show results',
    'Terminer le quiz':'End quiz','Retour à l’accueil':'Back to home','Code de la session':'Session code','Partagez ce code avec vos participants':'Share this code with your participants',
    'En attente de la prochaine question':'Waiting for the next question','Réponse envoyée':'Answer submitted','Votre score':'Your score','Quiz terminé':'Quiz finished',
    'Rejoindre la session':'Join session','Entrez votre pseudo':'Enter your nickname','Entrer le code':'Enter code','Code invalide':'Invalid code',
    'Pseudo déjà utilisé':'Nickname already in use','Session introuvable':'Session not found','Session complète':'Session full',
    'Mot de passe incorrect':'Incorrect password','Adresse email ou mot de passe incorrect.':'Incorrect email address or password.',
    'Une erreur est survenue. Réessayez.':'An error occurred. Please try again.','Connexion réussie':'Signed in successfully','Compte créé':'Account created',
    'Enregistrement…':'Saving…','Enregistré':'Saved','Chargement...':'Loading...','Chargement…':'Loading…','Supprimer définitivement ?':'Delete permanently?',
    'Annuler':'Cancel','Confirmer':'Confirm','Fermer':'Close','Copier':'Copy','Lien copié':'Link copied','Précédent':'Previous','Suivant':'Next',
    'Créer, administrer et analyser vos quiz':'Create, manage and analyze your quizzes','Accédez à vos quatre actions principales':'Access your four main actions',
    'Utilisez l’éditeur classique QuizLive':'Use the classic QuizLive editor','Retrouvez vos quiz, statistiques et paramètres':'Find your quizzes, statistics and settings',
    'Entrez directement un code de session à 6 caractères':'Enter a 6-character session code directly','Compte connecté :':'Signed in:',
    'Vue d’ensemble':'Overview','Mes quiz':'My quizzes','Historique':'History','Espace entreprise':'Company workspace','Abonnement':'Subscription',
    'Mon profil':'My profile','Paramètres':'Settings','Se déconnecter':'Sign out','Créer un quiz':'Create a quiz','Rejoindre une session':'Join a session','Mon espace':'My workspace'
  };
  const originals = new WeakMap();
  function lang(){ return window.QuizI18n?.getLanguage?.() || localStorage.getItem('quizliveLanguage') || 'fr'; }
  function translateText(text){
    const raw=String(text||''); const trimmed=raw.trim(); if(!trimmed||lang()!=='en') return raw;
    if(EN[trimmed]) return raw.replace(trimmed,EN[trimmed]);
    return raw.replace(/Compte connecté\s*:\s*/g,'Signed in: ').replace(/(\d+) participants?/gi,'$1 participants').replace(/(\d+) questions?/gi,'$1 questions').replace(/(\d+) éléments?/gi,'$1 items');
  }
  function apply(root=document.body){
    if(!root) return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let node;
    while((node=walker.nextNode())){
      if(!node.parentElement||['SCRIPT','STYLE','TEXTAREA'].includes(node.parentElement.tagName)) continue;
      if(!originals.has(node)) originals.set(node,node.nodeValue);
      const original=originals.get(node); node.nodeValue=lang()==='en'?translateText(original):original;
    }
    root.querySelectorAll?.('input[placeholder],textarea[placeholder]').forEach(el=>{
      if(!el.dataset.legacyOriginalPlaceholder) el.dataset.legacyOriginalPlaceholder=el.placeholder;
      const source=el.dataset.legacyOriginalPlaceholder; el.placeholder=lang()==='en'?(EN[source]||source):source;
    });
  }
  let queued=false;
  function queue(){ if(queued)return; queued=true; requestAnimationFrame(()=>{queued=false;apply();}); }
  document.addEventListener('quizlive:languagechange',queue);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{apply();new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});});
  else {apply();new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});}
})();
