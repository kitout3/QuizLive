# Déployer le mot de passe oublié QuizLive

Le nouveau flux n’utilise plus le modèle e-mail Firebase verrouillé.

Il utilise :

- Firebase Admin SDK pour générer un code de réinitialisation ;
- la Cloud Function `requestPasswordReset` ;
- Resend pour envoyer l’e-mail HTML QuizLive ;
- `reset-password-action.html` pour saisir le nouveau mot de passe.

## 1. Préparer Firebase CLI

Depuis un terminal dans le dossier du dépôt :

```bash
npm install -g firebase-tools
firebase login
firebase use quizlive-app
```

Le fichier `.firebaserc` sélectionne déjà `quizlive-app` par défaut.

## 2. Vérifier le secret Resend

Le projet utilise déjà le secret `RESEND_API_KEY` pour les invitations Enterprise.

Si ce secret n’a jamais été créé :

```bash
firebase functions:secrets:set RESEND_API_KEY
```

Collez ensuite la clé API Resend uniquement dans l’invite Firebase CLI.

Ne placez jamais cette clé dans GitHub, `config.js` ou un fichier `.env` versionné.

## 3. Expéditeur de test

Par défaut, la fonction utilise :

```text
QuizLive <onboarding@resend.dev>
```

Pour utiliser une adresse de domaine vérifiée, copiez `functions/.env.example` vers :

```text
functions/.env.quizlive-app
```

Puis remplacez :

```text
PASSWORD_RESET_FROM="QuizLive <noreply@votre-domaine.fr>"
```

Le domaine doit d’abord être validé dans Resend.

## 4. Déployer uniquement la nouvelle fonction

```bash
firebase deploy --only functions:requestPasswordReset
```

L’URL attendue est :

```text
https://europe-west1-quizlive-app.cloudfunctions.net/requestPasswordReset
```

## 5. Tester l’API

Remplacez l’adresse par un compte Firebase Auth existant :

```bash
curl -i -X POST "https://europe-west1-quizlive-app.cloudfunctions.net/requestPasswordReset" \
  -H "Origin: https://kitout3.github.io" \
  -H "Content-Type: application/json" \
  --data '{"email":"votre-adresse@example.com","language":"fr","website":""}'
```

Réponse normale :

```json
{
  "ok": true,
  "message": "Si un compte correspond à cette adresse, un e-mail sécurisé de réinitialisation a été envoyé."
}
```

Cette réponse reste identique lorsqu’aucun compte ne correspond à l’adresse, afin de ne pas révéler les comptes existants.

## 6. Tester depuis QuizLive

Ouvrez :

```text
https://kitout3.github.io/QuizLive/forgot-password.html?v=80
```

Demandez un nouveau lien, puis utilisez uniquement le dernier e-mail reçu.

Le bouton doit ouvrir :

```text
https://kitout3.github.io/QuizLive/reset-password-action.html?... 
```

et non plus :

```text
https://quizlive-app.firebaseapp.com/__/auth/action?...
```

## Protections intégrées

- CORS limité à `https://kitout3.github.io` et aux adresses locales de développement ;
- un envoi maximum par adresse et par minute ;
- limitation des requêtes par adresse IP ;
- champ invisible anti-robot ;
- aucune indication permettant de savoir si une adresse possède un compte ;
- aucun secret dans le navigateur ;
- codes générés uniquement côté serveur avec Firebase Admin.

## Diagnostic

### `Le service de réinitialisation n’est pas encore déployé`

La fonction n’a pas encore été déployée, ou le déploiement a échoué.

```bash
firebase functions:log --only requestPasswordReset
```

### Erreur Resend

Vérifiez le secret :

```bash
firebase functions:secrets:set RESEND_API_KEY
firebase deploy --only functions:requestPasswordReset
```

### L’e-mail n’arrive qu’à une seule adresse

L’expéditeur `onboarding@resend.dev` est destiné aux tests. Validez un domaine dans Resend, puis renseignez `PASSWORD_RESET_FROM` dans `functions/.env.quizlive-app`.

### Le lien est expiré

Demandez un nouveau lien et ouvrez uniquement le dernier e-mail reçu. Chaque nouvelle demande peut rendre les anciens liens inutiles.
