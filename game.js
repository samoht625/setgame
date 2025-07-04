import { GameLogic } from './gameLogic.js';
export class SetGameUI {
    constructor() {
        this.startTime = 0;
        this.gameTimer = null;
        this.isPaused = false;
        this.pauseOverlay = null;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.wasGamePausedBeforeModal = false;
        this.wasGameRunning = false;
        this.imageCache = new Map();
        this.gameEnded = false;
        this.lastScoreEntry = null;
        this.updateTimeout = null;
        this.gameLogic = new GameLogic();
        this.preloadImages().then(() => {
            this.initializeUI();
            this.startNewGame();
        });
    }
    async preloadImages() {
        const imagePromises = [];
        // Preload all 81 card images
        for (let i = 1; i <= 81; i++) {
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    this.imageCache.set(i, img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load image for card ${i}`);
                    resolve(); // Continue even if some images fail
                };
            });
            img.src = `cards/${i}.png`;
            imagePromises.push(promise);
        }
        // Wait for all images to load
        await Promise.all(imagePromises);
        console.log(`Preloaded ${this.imageCache.size} card images`);
    }
    initializeUI() {
        // Get main container
        this.gameContainer = document.getElementById('game-container');
        // Create status elements
        this.statusElement = document.getElementById('sets-count');
        this.timerElement = document.getElementById('timer');
        // Create card container
        this.cardContainer = document.getElementById('card-container');
        // Get buttons
        this.newGameButton = document.getElementById('new-game-btn');
        this.pauseButton = document.getElementById('pause-btn');
        this.highScoresButton = document.getElementById('best-times-btn');
        // Add event listeners
        this.newGameButton.addEventListener('click', () => this.startNewGame());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.highScoresButton.addEventListener('click', () => this.showHighScores());
        // Modal close functionality
        const modal = document.getElementById('high-scores-modal');
        const closeModal = document.getElementById('close-modal');
        closeModal.addEventListener('click', () => { this.closeHighScoresModal(); });
        modal.addEventListener('click', (e) => {
            if (e.target === modal)
                this.closeHighScoresModal();
        });
    }
    startNewGame() {
        this.gameLogic.startNewGame();
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.gameEnded = false;
        this.lastScoreEntry = null;
        this.pauseButton.querySelector('img').src = 'icons/pause.svg';
        this.pauseButton.querySelector('img').alt = 'Pause';
        this.pauseButton.title = 'Pause';
        this.hidePauseOverlay();
        // Set timer to 00:00 immediately
        this.timerElement.textContent = '00:00';
        this.startTimer();
        this.updateDisplay();
    }
    startTimer() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        this.startTime = Date.now();
        this.gameTimer = setInterval(() => {
            if (!this.isPaused) {
                this.updateTimer();
            }
        }, 1000);
    }
    updateTimer() {
        const elapsed = Math.floor((Date.now() - this.startTime - this.pausedTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        this.timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    updateDisplay() {
        // Clear any pending update to prevent race conditions
        if (this.updateTimeout) {
            cancelAnimationFrame(this.updateTimeout);
            this.updateTimeout = null;
        }
        // Use requestAnimationFrame for smooth, properly timed updates
        this.updateTimeout = requestAnimationFrame(() => {
            this.updateStatus();
            this.updateCards();
            this.updateButtons();
            if (this.gameLogic.isGameOver()) {
                this.endGame();
            }
            this.updateTimeout = null;
        });
    }
    updateStatus() {
        this.statusElement.textContent = this.gameLogic.getSetsFound().toString();
    }
    updateCards() {
        const displayedCards = this.gameLogic.getDisplayedCards();
        const selectedCards = this.gameLogic.getSelectedCards();
        // Adjust grid layout BEFORE DOM manipulation to prevent layout thrashing
        this.adjustGridLayout(displayedCards.length);
        // Smart DOM diffing instead of innerHTML clearing
        this.updateCardsWithDiffing(displayedCards, selectedCards);
    }
    updateCardsWithDiffing(displayedCards, selectedCards) {
        const existingCards = Array.from(this.cardContainer.children);
        const existingCardIds = existingCards.map(el => parseInt(el.dataset.cardId || '0'));
        const newCardIds = displayedCards.map(card => card.getId());
        // Remove cards that are no longer displayed
        existingCards.forEach((cardEl, index) => {
            const cardId = existingCardIds[index];
            if (!newCardIds.includes(cardId)) {
                cardEl.remove();
            }
        });
        // Add or update cards
        displayedCards.forEach((card, index) => {
            const cardId = card.getId();
            const isSelected = selectedCards.has(card);
            const existingIndex = existingCardIds.indexOf(cardId);
            if (existingIndex === -1) {
                // New card - create and insert at correct position
                const cardElement = this.createCardElement(card, isSelected);
                if (index < this.cardContainer.children.length) {
                    this.cardContainer.insertBefore(cardElement, this.cardContainer.children[index]);
                }
                else {
                    this.cardContainer.appendChild(cardElement);
                }
            }
            else {
                // Existing card - update selection state only if needed
                const existingEl = existingCards[existingIndex];
                const currentlySelected = existingEl.classList.contains('selected');
                if (currentlySelected !== isSelected) {
                    if (isSelected) {
                        existingEl.classList.add('selected');
                    }
                    else {
                        existingEl.classList.remove('selected');
                    }
                }
                // Move to correct position if needed
                const currentPosition = Array.from(this.cardContainer.children).indexOf(existingEl);
                if (currentPosition !== index) {
                    if (index < this.cardContainer.children.length) {
                        this.cardContainer.insertBefore(existingEl, this.cardContainer.children[index]);
                    }
                    else {
                        this.cardContainer.appendChild(existingEl);
                    }
                }
            }
        });
    }
    adjustGridLayout(cardCount) {
        // Remove any existing grid class
        this.cardContainer.className = this.cardContainer.className.replace(/\bgrid-\d+-cols\b/g, '');
        // Add appropriate grid class based on card count
        if (cardCount <= 12) {
            this.cardContainer.classList.add('grid-4-cols');
        }
        else if (cardCount <= 15) {
            this.cardContainer.classList.add('grid-5-cols');
        }
        else {
            this.cardContainer.classList.add('grid-6-cols');
        }
    }
    createCardElement(card, isSelected) {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${isSelected ? 'selected' : ''}`;
        cardDiv.dataset.cardId = card.getId().toString();
        const cardId = card.getId();
        const cachedImg = this.imageCache.get(cardId);
        // Always create a new img element for consistency
        const img = document.createElement('img');
        img.alt = card.toString();
        img.draggable = false;
        if (cachedImg) {
            // Use cached image src for instant loading
            img.src = cachedImg.src;
            // Copy any additional properties from cached image
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        }
        else {
            // Fallback to original method if image not cached
            img.src = `cards/${cardId}.png`;
        }
        cardDiv.appendChild(img);
        cardDiv.addEventListener('click', () => {
            if (!this.isPaused) {
                const wasSet = this.handleCardSelection(card);
                // Only auto-deal if a set was found and now there is no set visible
                if (wasSet) {
                    this.autoDealIfNoSet();
                }
                // Single update after all logic is complete
                this.updateDisplay();
            }
        });
        return cardDiv;
    }
    // Returns true if a set was found and replaced
    handleCardSelection(card) {
        const beforeSetsFound = this.gameLogic.getSetsFound();
        this.gameLogic.selectCard(card);
        const afterSetsFound = this.gameLogic.getSetsFound();
        return afterSetsFound > beforeSetsFound;
    }
    updateButtons() {
        // No buttons to update
    }
    autoDealIfNoSet() {
        // If no set is visible and cards remain, deal more cards automatically
        while (!this.gameLogic.hasVisibleSet() && this.gameLogic.getRemainingCards() > 0) {
            this.gameLogic.dealMoreCards();
        }
    }
    showHighScores() {
        const modal = document.getElementById('high-scores-modal');
        const table = document.getElementById('high-scores-table');
        const noScores = document.getElementById('no-scores');
        const tbody = document.getElementById('high-scores-list');
        // Pause game if it's running and not already paused
        this.wasGamePausedBeforeModal = this.isPaused;
        this.wasGameRunning = this.gameTimer !== null && !this.gameLogic.isGameOver();
        if (this.wasGameRunning && !this.isPaused) {
            this.togglePause();
        }
        const scores = this.getHighScores();
        const isNewScore = this.lastScoreEntry !== null;
        const isHighScore = isNewScore && scores.some(score => score.time === this.lastScoreEntry.time &&
            score.date === this.lastScoreEntry.date);
        if (scores.length === 0 && !isNewScore) {
            table.style.display = 'none';
            noScores.style.display = 'block';
        }
        else {
            table.style.display = 'table';
            noScores.style.display = 'none';
            tbody.innerHTML = '';
            // Show top 10 scores
            scores.forEach((entry, index) => {
                const row = document.createElement('tr');
                const isThisNewScore = isNewScore &&
                    entry.time === this.lastScoreEntry.time &&
                    entry.date === this.lastScoreEntry.date;
                if (isThisNewScore) {
                    row.classList.add('new-score');
                }
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${entry.time}</td>
                    <td>${entry.date}</td>
                `;
                tbody.appendChild(row);
            });
            // If the new score is not a high score, show it at the bottom
            if (isNewScore && !isHighScore) {
                const row = document.createElement('tr');
                row.classList.add('not-high-score');
                row.innerHTML = `
                    <td>-</td>
                    <td>${this.lastScoreEntry.time}</td>
                    <td>${this.lastScoreEntry.date} (Not a high score)</td>
                `;
                tbody.appendChild(row);
            }
        }
        modal.style.display = 'flex';
    }
    closeHighScoresModal() {
        const modal = document.getElementById('high-scores-modal');
        modal.style.display = 'none';
        // Resume game if it was running and not paused before modal opened
        if (this.wasGameRunning && !this.wasGamePausedBeforeModal && this.isPaused) {
            this.togglePause();
        }
    }
    endGame() {
        if (this.gameEnded)
            return; // Prevent duplicate calls
        this.gameEnded = true;
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        const elapsed = Math.floor((Date.now() - this.startTime - this.pausedTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        // Save the score and show high scores modal
        this.saveHighScore(timeStr, this.gameLogic.getSetsFound());
        setTimeout(() => {
            this.showHighScores();
        }, 500);
    }
    saveHighScore(timeStr, setsFound) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const scoreEntry = {
            time: timeStr,
            date: dateStr,
            timeSeconds: this.parseTimeToSeconds(timeStr)
        };
        this.lastScoreEntry = scoreEntry;
        const scores = this.getHighScores();
        scores.push(scoreEntry);
        // Sort by time (fastest first)
        scores.sort((a, b) => a.timeSeconds - b.timeSeconds);
        // Keep only top 10
        const topScores = scores.slice(0, 10);
        localStorage.setItem('setGameHighScores', JSON.stringify(topScores));
    }
    getHighScores() {
        const scores = localStorage.getItem('setGameHighScores');
        if (!scores)
            return [];
        const parsed = JSON.parse(scores);
        // Migration: Convert old string format to new object format
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
            const migrated = parsed.map((scoreStr) => ({
                time: scoreStr.split(' ')[0], // Remove "(X sets)" part
                date: 'Jun 29, 2025',
                timeSeconds: this.parseTimeToSeconds(scoreStr.split(' ')[0])
            }));
            localStorage.setItem('setGameHighScores', JSON.stringify(migrated));
            return migrated;
        }
        return parsed;
    }
    parseTimeToSeconds(timeStr) {
        const [minutes, seconds] = timeStr.split(':').map(Number);
        return minutes * 60 + seconds;
    }
    togglePause() {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseStartTime = Date.now();
            this.pauseButton.querySelector('img').src = 'icons/play.svg';
            this.pauseButton.querySelector('img').alt = 'Resume';
            this.pauseButton.title = 'Resume';
            this.showPauseOverlay();
        }
        else {
            this.pausedTime += Date.now() - this.pauseStartTime;
            this.pauseButton.querySelector('img').src = 'icons/pause.svg';
            this.pauseButton.querySelector('img').alt = 'Pause';
            this.pauseButton.title = 'Pause';
            this.hidePauseOverlay();
        }
    }
    showPauseOverlay() {
        if (!this.pauseOverlay) {
            this.pauseOverlay = document.createElement('div');
            this.pauseOverlay.className = 'pause-overlay';
            this.pauseOverlay.innerHTML = '<div class="pause-text">PAUSED</div>';
            this.cardContainer.appendChild(this.pauseOverlay);
        }
        this.pauseOverlay.style.display = 'flex';
    }
    hidePauseOverlay() {
        if (this.pauseOverlay) {
            this.pauseOverlay.style.display = 'none';
        }
    }
}
