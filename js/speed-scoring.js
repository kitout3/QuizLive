// QuizLive - Timer et notation selon la rapidité
// Chargé après app.js depuis config.template.js / config.js.
(() => {
    'use strict';

    const QUESTION_DURATION_SECONDS = 20;
    const MAX_CORRECT_POINTS = 100;
    const MIN_CORRECT_POINTS = 0;
    const POINTS_LOST_PER_SECOND = 5;

    let serverTimeOffset = 0;
    let timerInterval = null;

    database.ref('.info/serverTimeOffset').on('value', snapshot => {
        serverTimeOffset = Number(snapshot.val()) || 0;
    });

    const serverNow = () => Date.now() + serverTimeOffset;

    function calculateSpeedPoints(startedAt, answeredAt) {
        if (!startedAt || !answeredAt) return MIN_CORRECT_POINTS;
        const elapsedSeconds = Math.max(0, (answeredAt - startedAt) / 1000);
        return Math.max(
            MIN_CORRECT_POINTS,
            Math.round(MAX_CORRECT_POINTS - (elapsedSeconds * POINTS_LOST_PER_SECOND))
        );
    }

    function clearQuestionTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function renderQuestionTimer(question, hasAnswered) {
        clearQuestionTimer();
        if (!question || !question.startedAt || question.showResults || hasAnswered) return;

        const target = document.querySelector('.player-question-number');
        if (!target) return;

        const timer = document.createElement('div');
        timer.id = 'speedQuestionTimer';
        timer.style.cssText = [
            'margin: 10px auto 18px',
            'width: fit-content',
            'padding: 8px 14px',
            'border-radius: 999px',
            'font-weight: 700',
            'font-size: 1rem',
            'background: rgba(99,102,241,.18)',
            'border: 1px solid rgba(129,140,248,.45)',
            'color: #fff'
        ].join(';');
        target.insertAdjacentElement('afterend', timer);

        const refresh = () => {
            const elapsed = Math.max(0, serverNow() - Number(question.startedAt));
            const remaining = Math.max(0, QUESTION_DURATION_SECONDS * 1000 - elapsed);
            const seconds = Math.ceil(remaining / 1000);
            const potentialPoints = calculateSpeedPoints(Number(question.startedAt), serverNow());
            timer.textContent = `⏱️ ${seconds}s — jusqu’à ${potentialPoints} points`;

            if (remaining <= 0) {
                clearQuestionTimer();
                timer.textContent = '⏱️ Temps écoulé — 0 point';
            }
        };

        refresh();
        timerInterval = setInterval(refresh, 200);
    }

    function injectAwardedPoints(questionIndex) {
        const player = playerSession?.participants?.[playerId];
        const awarded = player?.answerPoints?.[questionIndex];
        if (awarded === undefined || awarded === null) return;

        const feedback = document.querySelector('.feedback-message');
        if (feedback && Number(awarded) > 0) {
            feedback.textContent = `Bonne réponse ! +${Number(awarded)} points`;
        }
    }

    function stampQuestionStart(questionIndex, extraUpdates = {}) {
        const code = currentSession?.code;
        if (!code || questionIndex < 0) return Promise.resolve();

        return database.ref(`sessions/${code}`).update({
            ...extraUpdates,
            [`questions/${questionIndex}/startedAt`]: firebase.database.ServerValue.TIMESTAMP,
            [`questions/${questionIndex}/showResults`]: false
        });
    }

    window.startQuiz = function startQuizWithTimer() {
        if (!currentSession?.questions?.length) {
            showToast('Ajoutez au moins une question', 'error');
            return;
        }

        stampQuestionStart(0, {
            status: 'active',
            currentQuestion: 0
        }).then(() => showToast('Quiz lancé !'));
    };

    window.nextQuestion = function nextQuestionWithTimer() {
        const nextIndex = Number(currentSession?.currentQuestion ?? -1) + 1;
        if (nextIndex < (currentSession?.questions?.length || 0)) {
            stampQuestionStart(nextIndex, { currentQuestion: nextIndex });
        }
    };

    const originalRenderPlayerMCQ = window.renderPlayerMCQ;
    if (typeof originalRenderPlayerMCQ === 'function') {
        window.renderPlayerMCQ = function renderPlayerMCQWithTimer(question, index) {
            originalRenderPlayerMCQ(question, index);
            const player = playerSession?.participants?.[playerId];
            const hasAnswered = player?.answers?.[index] !== undefined;
            renderQuestionTimer(question, hasAnswered);
            injectAwardedPoints(index);
        };
    }

    window.submitMCQAnswer = function submitMCQAnswerWithSpeed(questionIndex, answerIndex) {
        const session = playerSession;
        const id = playerId;
        const question = session?.questions?.[questionIndex];
        if (!session || !id || !question) return;

        const participantPath = `sessions/${session.code}/participants/${id}`;
        const answerRef = database.ref(`${participantPath}/answers/${questionIndex}`);
        const answeredAt = serverNow();
        const isCorrect = Number(question.correct) === Number(answerIndex);
        const awardedPoints = isCorrect
            ? calculateSpeedPoints(Number(question.startedAt), answeredAt)
            : 0;

        // Réserver d'abord uniquement cette réponse. Cela évite la transaction
        // sur l'objet participant complet qui échouait à partir de la 2e question.
        answerRef.transaction(currentAnswer => {
            if (currentAnswer !== null) return;
            return Number(answerIndex);
        }, async (error, committed) => {
            if (error) {
                console.error('Erreur enregistrement réponse :', error);
                showToast('La réponse n’a pas pu être enregistrée', 'error');
                return;
            }

            if (!committed) {
                showToast('Réponse déjà enregistrée', 'error');
                return;
            }

            try {
                const updates = {};
                updates[`${participantPath}/answerTimes/${questionIndex}`] = {
                    answeredAt,
                    elapsedMs: question.startedAt
                        ? Math.max(0, answeredAt - Number(question.startedAt))
                        : null
                };
                updates[`${participantPath}/answerPoints/${questionIndex}`] = awardedPoints;
                await database.ref().update(updates);

                if (awardedPoints > 0) {
                    await database.ref(`${participantPath}/score`).transaction(score =>
                        (Number(score) || 0) + awardedPoints
                    );
                }
            } catch (writeError) {
                console.error('Erreur mise à jour du score :', writeError);
                showToast('Réponse enregistrée, mais le score n’a pas pu être mis à jour', 'error');
            }
        }, false);
    };

    console.log('✅ Timer et notation par rapidité activés');
})();
