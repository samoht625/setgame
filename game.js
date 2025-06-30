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
        this.updateStatus();
        this.updateCards();
        this.updateButtons();
        if (this.gameLogic.isGameOver()) {
            this.endGame();
        }
    }
    updateStatus() {
        this.statusElement.textContent = this.gameLogic.getSetsFound().toString();
    }
    updateCards() {
        this.cardContainer.innerHTML = '';
        const displayedCards = this.gameLogic.getDisplayedCards();
        const selectedCards = this.gameLogic.getSelectedCards();
        // Adjust grid layout based on number of cards
        this.adjustGridLayout(displayedCards.length);
        displayedCards.forEach(card => {
            const cardElement = this.createCardElement(card, selectedCards.has(card));
            this.cardContainer.appendChild(cardElement);
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
        const cardId = card.getId();
        const cachedImg = this.imageCache.get(cardId);
        if (cachedImg) {
            // Clone the cached image for instant display
            const img = cachedImg.cloneNode(true);
            img.alt = card.toString();
            img.draggable = false;
            cardDiv.appendChild(img);
        }
        else {
            // Fallback to original method if image not cached
            const img = document.createElement('img');
            img.src = `cards/${cardId}.png`;
            img.alt = card.toString();
            img.draggable = false;
            cardDiv.appendChild(img);
        }
        cardDiv.addEventListener('click', () => {
            if (!this.isPaused) {
                const wasSet = this.handleCardSelection(card);
                this.updateDisplay();
                // Only auto-deal if a set was found and now there is no set visible
                if (wasSet) {
                    this.autoDealIfNoSet();
                    this.updateDisplay();
                }
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
        if (scores.length === 0) {
            table.style.display = 'none';
            noScores.style.display = 'block';
        }
        else {
            table.style.display = 'table';
            noScores.style.display = 'none';
            tbody.innerHTML = '';
            scores.forEach((entry, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${entry.time}</td>
                    <td>${entry.date}</td>
                `;
                tbody.appendChild(row);
            });
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
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }
        const elapsed = Math.floor((Date.now() - this.startTime - this.pausedTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        const message = `Game Over!\n\nSets Found: ${this.gameLogic.getSetsFound()}\nTime: ${timeStr}\n\nWell done!`;
        setTimeout(() => {
            alert(message);
            this.saveHighScore(timeStr, this.gameLogic.getSetsFound());
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
