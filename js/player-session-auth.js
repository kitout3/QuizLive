// QuizLive - isolation de l'authentification des participants par onglet
(() => {
    'use strict';

    async function createFreshPlayerIdentity() {
        // SESSION utilise sessionStorage : chaque onglet peut conserver son propre joueur.
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);

        const currentUser = firebase.auth().currentUser;
        if (currentUser) {
            await firebase.auth().signOut();
        }

        const credential = await firebase.auth().signInAnonymously();
        return credential.user;
    }

    function sanitizePlayerName(value) {
        return String(value || '')
            .trim()
            .substring(0, 30)
            .replace(/[<>\"\'&]/g, '');
    }

    async function registerPlayer(sessionCode, playerName) {
        const user = await createFreshPlayerIdentity();
        const participantId = user.uid;

        await database.ref(`sessions/${sessionCode}/participants/${participantId}`).set({
            id: participantId,
            name: playerName,
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            score: 0
        });

        // sessionStorage évite également que deux onglets partagent le même joueur.
        const sessionData = {
            code: sessionCode,
            isAdmin: false,
            odparticipantId: participantId,
            name: playerName
        };
        sessionStorage.setItem('quizSession', JSON.stringify(sessionData));
        localStorage.removeItem('quizSession');

        return { participantId, sessionData };
    }

    window.joinViaQR = async function joinViaQRWithIsolatedAuth(event) {
        event.preventDefault();

        const sessionCode = document.getElementById('qrSessionCode')?.value.trim().toUpperCase();
        const playerName = sanitizePlayerName(document.getElementById('qrPlayerName')?.value);

        if (!sessionCode || !playerName) {
            showToast('Entrez un pseudo valide', 'error');
            return;
        }

        try {
            const { participantId } = await registerPlayer(sessionCode, playerName);
            document.getElementById('joinViaQRModal')?.classList.remove('active');
            playerId = participantId;
            document.getElementById('playerName').textContent = playerName;
            startPlayerSession(sessionCode, participantId, playerName);
            showToast(`Bienvenue ${playerName} !`);
        } catch (error) {
            console.error('Erreur inscription participant :', error);
            showToast(`Connexion impossible : ${error.message}`, 'error');
        }
    };

    window.joinQuiz = async function joinQuizWithIsolatedAuth(event) {
        event.preventDefault();

        const sessionCode = document.getElementById('sessionCode')?.value.trim().toUpperCase();
        const playerName = sanitizePlayerName(document.getElementById('playerName')?.value);

        if (!sessionCode || !playerName) {
            showToast('Veuillez remplir tous les champs', 'error');
            return;
        }

        try {
            const { sessionData } = await registerPlayer(sessionCode, playerName);
            sessionStorage.setItem('quizSession', JSON.stringify(sessionData));
            window.location.href = `play.html?code=${sessionCode}`;
        } catch (error) {
            console.error('Erreur inscription participant :', error);
            showToast(`Connexion impossible : ${error.message}`, 'error');
        }
    };

    console.log('✅ Authentification participant isolée par onglet');
})();
