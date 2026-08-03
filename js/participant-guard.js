// QuizLive - protection contre les doublons de participants
(() => {
    'use strict';

    let joinInProgress = false;

    function normalizePseudo(value) {
        return String(value || '')
            .trim()
            .toLocaleLowerCase('fr-FR')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');
    }

    async function pseudoExists(sessionCode, pseudo) {
        const snapshot = await database.ref(`sessions/${sessionCode}/participants`).once('value');
        const participants = snapshot.val() || {};
        const normalized = normalizePseudo(pseudo);
        return Object.values(participants).some(p => normalizePseudo(p?.name) === normalized);
    }

    function setSubmitState(button, disabled) {
        if (!button) return;
        button.disabled = disabled;
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = disabled ? 'Connexion...' : button.dataset.originalText;
    }

    async function guardJoin({ event, code, pseudo, original }) {
        event?.preventDefault?.();
        if (joinInProgress) return;

        const cleanPseudo = String(pseudo || '').trim().substring(0, 30).replace(/[<>\"'&]/g, '');
        const cleanCode = String(code || '').trim().toUpperCase();
        const submitButton = event?.submitter || event?.target?.querySelector?.('button[type="submit"]');

        if (!cleanCode || !cleanPseudo) {
            showToast('Veuillez renseigner le code et un pseudo', 'error');
            return;
        }

        joinInProgress = true;
        setSubmitState(submitButton, true);

        try {
            if (await pseudoExists(cleanCode, cleanPseudo)) {
                showToast('Ce pseudo est déjà utilisé dans cette partie', 'error');
                return;
            }

            await original(event);
        } catch (error) {
            console.error('Erreur contrôle du pseudo :', error);
            showToast('Impossible de vérifier le pseudo', 'error');
        } finally {
            joinInProgress = false;
            setSubmitState(submitButton, false);
        }
    }

    const originalJoinQuiz = window.joinQuiz;
    if (typeof originalJoinQuiz === 'function') {
        window.joinQuiz = function guardedJoinQuiz(event) {
            return guardJoin({
                event,
                code: document.getElementById('sessionCode')?.value,
                pseudo: document.getElementById('playerName')?.value,
                original: originalJoinQuiz
            });
        };
    }

    const originalJoinViaQR = window.joinViaQR;
    if (typeof originalJoinViaQR === 'function') {
        window.joinViaQR = function guardedJoinViaQR(event) {
            return guardJoin({
                event,
                code: document.getElementById('qrSessionCode')?.value,
                pseudo: document.getElementById('qrPlayerName')?.value,
                original: originalJoinViaQR
            });
        };
    }

    async function removeExistingDuplicates() {
        if (document.body?.dataset?.page !== 'admin') return;
        const code = new URLSearchParams(window.location.search).get('code');
        if (!code) return;

        const ref = database.ref(`sessions/${code}/participants`);
        const snapshot = await ref.once('value');
        const participants = snapshot.val() || {};
        const groups = new Map();

        Object.entries(participants).forEach(([id, player]) => {
            const key = normalizePseudo(player?.name);
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ id, player });
        });

        const updates = {};
        groups.forEach(entries => {
            if (entries.length < 2) return;
            entries.sort((a, b) => {
                const answerDiff = Object.keys(b.player?.answers || {}).length - Object.keys(a.player?.answers || {}).length;
                if (answerDiff) return answerDiff;
                const scoreDiff = Number(b.player?.score || 0) - Number(a.player?.score || 0);
                if (scoreDiff) return scoreDiff;
                return Number(a.player?.joinedAt || 0) - Number(b.player?.joinedAt || 0);
            });
            entries.slice(1).forEach(entry => {
                updates[entry.id] = null;
            });
        });

        if (Object.keys(updates).length) {
            await ref.update(updates);
            showToast('Doublons de participants supprimés');
        }
    }

    setTimeout(() => removeExistingDuplicates().catch(console.error), 1500);
    console.log('✅ Pseudos uniques activés');
})();