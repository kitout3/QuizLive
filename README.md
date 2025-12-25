# 🎯 QuizLive v2 - Quiz Interactif en Temps Réel

Application de quiz interactif avec support QCM, Vrai/Faux, nuages de mots, classements et slides.

## 🚀 Déploiement sur GitHub Pages

### Étape 1 : Créer le Repository GitHub

1. Créez un nouveau repository sur GitHub
2. Uploadez tous les fichiers de ce projet

### Étape 2 : Configurer les Secrets GitHub

Allez dans **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Créez les secrets suivants avec vos valeurs Firebase :

| Nom du Secret | Description | Exemple |
|---------------|-------------|---------|
| `FIREBASE_API_KEY` | Clé API Firebase | `AIzaSyB...` |
| `FIREBASE_AUTH_DOMAIN` | Domaine d'authentification | `monprojet.firebaseapp.com` |
| `FIREBASE_DATABASE_URL` | URL de la base de données | `https://monprojet-default-rtdb.europe-west1.firebasedatabase.app` |
| `FIREBASE_PROJECT_ID` | ID du projet | `monprojet` |
| `FIREBASE_STORAGE_BUCKET` | Bucket de stockage | `monprojet.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | ID d'envoi de messages | `123456789012` |
| `FIREBASE_APP_ID` | ID de l'application | `1:123456789012:web:abc123...` |
| `FIREBASE_ADMIN_UID` | UID du compte admin | `7DEy3WkKdQgbz7Kh7KCIrScb2el2` |

#### Où trouver ces valeurs ?

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Cliquez sur ⚙️ **Paramètres du projet**
4. Dans l'onglet **Général**, scrollez jusqu'à **Vos applications**
5. Copiez les valeurs du `firebaseConfig`

### Étape 3 : Activer GitHub Pages

1. Allez dans **Settings** → **Pages**
2. Source : **GitHub Actions**
3. Le workflow se déclenchera automatiquement à chaque push

### Étape 4 : Configurer Firebase

#### A. Authentification
1. Firebase Console → **Authentication** → **Sign-in method**
2. Activez **Email/Password** (pour l'admin)
3. Activez **Anonymous** (pour les participants)
4. Créez un compte admin dans **Users** → **Add user**

#### B. Règles Realtime Database

Copiez ces règles dans **Realtime Database** → **Rules** :

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "sessions": {
      "$sessionId": {
        ".read": "auth != null && (auth.uid === 'VOTRE_ADMIN_UID' || data.child('participants').hasChild(auth.uid))",
        ".write": "auth != null && auth.uid === 'VOTRE_ADMIN_UID'",

        "participants": {
          "$participantId": {
            ".read": "auth != null && auth.uid === $participantId",
            ".write": "auth != null && auth.uid === $participantId",
            ".validate": "newData.hasChildren(['id', 'name', 'joinedAt']) &&
                          newData.child('id').val() === $participantId &&
                          newData.child('name').isString() &&
                          newData.child('name').val().length >= 1 &&
                          newData.child('name').val().length <= 30 &&
                          newData.child('joinedAt').isNumber()",

            "answers": {
              "$questionIndex": {
                ".write": "auth != null && auth.uid === $participantId",
                ".validate": "(newData.isNumber() && newData.val() >= 0 && newData.val() <= 10) || (newData.isString() && newData.val().length <= 200)"
              }
            },

            "score": {
              ".write": "auth != null && auth.uid === $participantId",
              ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000 && (!data.exists() || newData.val() >= data.val())"
            }
          }
        }
      }
    },

    "savedSessions": {
      ".read": "auth != null && auth.uid === 'VOTRE_ADMIN_UID'",
      ".write": "auth != null && auth.uid === 'VOTRE_ADMIN_UID'"
    }
  }
}
```

⚠️ **IMPORTANT** : Remplacez `VOTRE_ADMIN_UID` par l'UID de votre compte admin.
Pour le trouver : Firebase Console → Authentication → Users → copiez l'UID du compte admin.

#### C. Domaines autorisés

Firebase Console → **Authentication** → **Settings** → **Authorized domains**

Ajoutez :
- `votre-username.github.io`

---

## 🔧 Développement Local

### Option 1 : Créer un fichier config local

1. Copiez `js/config.template.js` vers `js/config.js`
2. Remplacez les placeholders par vos vraies clés Firebase
3. Le fichier `config.js` est ignoré par Git (voir `.gitignore`)

### Option 2 : Utiliser un serveur local

```bash
# Avec Python
python -m http.server 8000

# Avec Node.js
npx serve .
```

Puis ouvrez `http://localhost:8000`

---

## 📁 Structure du Projet

```
quizzlive-v2/
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Actions pour le déploiement
├── css/
│   └── style.css           # Styles de l'application
├── js/
│   ├── app.js              # Logique principale
│   ├── config.js           # Placeholder (remplacé au déploiement)
│   └── config.template.js  # Template pour GitHub Actions
├── index.html              # Page d'accueil
├── admin.html              # Interface admin
├── play.html               # Interface joueur
├── presenter.html          # Mode présentation
├── .gitignore              # Fichiers ignorés
└── README.md               # Ce fichier
```

---

## 🔐 Sécurité

- ✅ Les clés Firebase sont stockées dans les **GitHub Secrets**
- ✅ Les clés ne sont **jamais** committées dans le repository
- ✅ Le fichier `config.js` est ignoré par Git
- ✅ Les règles Firebase protègent les données
- ✅ Authentification anonyme pour les participants
- ✅ Authentification email/password pour l'admin

### Note sur la sécurité côté client

Les clés Firebase côté client sont conçues pour être "publiques" dans le sens où elles sont visibles dans le navigateur. La **vraie sécurité** vient des :
- **Règles Firebase** (qui contrôlent l'accès aux données)
- **Authentification** (qui vérifie l'identité)

L'utilisation de GitHub Secrets empêche simplement les clés d'apparaître dans l'historique Git.

---

## 📋 Fonctionnalités

- 📊 Questions QCM (choix multiples)
- ✅ Questions Vrai/Faux
- ☁️ Nuages de mots interactifs
- 📈 Questions de classement (drag & drop)
- 🖼️ Slides/Images plein écran
- 📱 QR Code pour rejoindre facilement
- 🎯 Mode présentation pour vidéoprojecteur
- 💾 Sauvegarde/Chargement de sessions
- 📥 Import depuis PowerPoint/Excel
- 🔒 Sécurité avec authentification Firebase

---

## 🆘 Dépannage

### Le déploiement échoue
- Vérifiez que tous les secrets GitHub sont configurés
- Vérifiez les logs dans **Actions** → cliquez sur le workflow

### "Firebase config not set"
- Les secrets ne sont pas configurés ou sont incorrects
- Vérifiez l'orthographe exacte des noms de secrets

### Erreur de permission Firebase
- Vérifiez que l'UID admin est correct dans les règles
- Vérifiez que l'authentification anonyme est activée

### QR code ne fonctionne pas
- Assurez-vous d'être connecté en admin avant d'ouvrir le presenter
- Vérifiez que le domaine est autorisé dans Firebase

---

## 📄 Licence

MIT License - Libre d'utilisation et de modification.
