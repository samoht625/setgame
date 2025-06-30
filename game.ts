import { Card } from './card.js';
import { GameLogic } from './gameLogic.js';

interface HighScoreEntry {
    time: string;
    date: string;
    timeSeconds: number;
}

export class SetGameUI {
    private startTime: number = 0;
    private gameTimer: number | null = null;
    private isPaused: boolean = false;
    private pauseOverlay: HTMLElement | null = null;
    private pausedTime: number = 0;
    private pauseStartTime: number = 0;
    private wasGamePausedBeforeModal: boolean = false;
    private wasGameRunning: boolean = false;
    private gameLogic: GameLogic;
    private imageCache: Map<number, HTMLImageElement> = new Map();
    private gameEnded: boolean = false;
    private lastScoreEntry: HighScoreEntry | null = null;
    private updateTimeout: number | null = null;
    
    // DOM elements
    private gameContainer!: HTMLElement;
    private statusElement!: HTMLElement;
    private timerElement!: HTMLElement;
    private cardContainer!: HTMLElement;
    private newGameButton!: HTMLButtonElement;
    private pauseButton!: HTMLButtonElement;
    private highScoresButton!: HTMLButtonElement;

    constructor() {
        this.gameLogic = new GameLogic();
        this.preloadImages().then(() => {
            this.initializeUI();
            this.startNewGame();
        });
    }

    private async preloadImages(): Promise<void> {
        const imagePromises: Promise<void>[] = [];
        
        // Preload all 81 card images
        for (let i = 1; i <= 81; i++) {
            const img = new Image();
            const promise = new Promise<void>((resolve, reject) => {
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

    private initializeUI(): void {
        // Get main container
        this.gameContainer = document.getElementById('game-container')!;
        
        // Create status elements
        this.statusElement = document.getElementById('sets-count')!;
        this.timerElement = document.getElementById('timer')!;
        
        // Create card container
        this.cardContainer = document.getElementById('card-container')!;
        
        // Get buttons
        this.newGameButton = document.getElementById('new-game-btn')! as HTMLButtonElement;
        this.pauseButton = document.getElementById('pause-btn')! as HTMLButtonElement;
        this.highScoresButton = document.getElementById('best-times-btn')! as HTMLButtonElement;
        
        // Add event listeners
        this.newGameButton.addEventListener('click', () => this.startNewGame());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.highScoresButton.addEventListener('click', () => this.showHighScores());
        
        // Modal close functionality
        const modal = document.getElementById('high-scores-modal')!;
        const closeModal = document.getElementById('close-modal')!;
        closeModal.addEventListener('click', () => { this.closeHighScoresModal(); });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeHighScoresModal();
        });
    }

    private startNewGame(): void {
        this.gameLogic.startNewGame();
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.gameEnded = false;
        this.lastScoreEntry = null;
        (this.pauseButton.querySelector('img') as HTMLImageElement).src = 'icons/pause.svg';
        (this.pauseButton.querySelector('img') as HTMLImageElement).alt = 'Pause';
        this.pauseButton.title = 'Pause';
        this.hidePauseOverlay();
        
        // Set timer to 00:00 immediately
        this.timerElement.textContent = '00:00';
        
        this.startTimer();
        this.updateDisplay();
    }

    private startTimer(): void {
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

    private updateTimer(): void {
        const elapsed = Math.floor((Date.now() - this.startTime - this.pausedTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        
        this.timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    private updateDisplay(): void {
        // Clear any pending update
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        // Use requestAnimationFrame for smooth updates
        this.updateTimeout = requestAnimationFrame(() => {
            this.updateStatus();
            this.updateCards();
            this.updateButtons();
            
            if (this.gameLogic.isGameOver()) {
                this.endGame();
            }
            this.updateTimeout = null;
        }) as any;
    }

    private updateStatus(): void {
        this.statusElement.textContent = this.gameLogic.getSetsFound().toString();
    }

    private updateCards(): void {
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

    private adjustGridLayout(cardCount: number): void {
        // Remove any existing grid class
        this.cardContainer.className = this.cardContainer.className.replace(/\bgrid-\d+-cols\b/g, '');
        
        // Add appropriate grid class based on card count
        if (cardCount <= 12) {
            this.cardContainer.classList.add('grid-4-cols');
        } else if (cardCount <= 15) {
            this.cardContainer.classList.add('grid-5-cols');
        } else {
            this.cardContainer.classList.add('grid-6-cols');
        }
    }

    private createCardElement(card: Card, isSelected: boolean): HTMLElement {
        const cardDiv = document.createElement('div');
        cardDiv.className = `card ${isSelected ? 'selected' : ''}`;
        
        const cardId = card.getId();
        const cachedImg = this.imageCache.get(cardId);
        
        if (cachedImg) {
            // Clone the cached image for instant display
            const img = cachedImg.cloneNode(true) as HTMLImageElement;
            img.alt = card.toString();
            img.draggable = false;
            cardDiv.appendChild(img);
        } else {
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
    private handleCardSelection(card: Card): boolean {
        const beforeSetsFound = this.gameLogic.getSetsFound();
        this.gameLogic.selectCard(card);
        const afterSetsFound = this.gameLogic.getSetsFound();
        return afterSetsFound > beforeSetsFound;
    }

    private updateButtons(): void {
        // No buttons to update
    }

    private autoDealIfNoSet(): void {
        // If no set is visible and cards remain, deal more cards automatically
        while (!this.gameLogic.hasVisibleSet() && this.gameLogic.getRemainingCards() > 0) {
            this.gameLogic.dealMoreCards();
        }
    }

    private showHighScores(): void {
        const modal = document.getElementById('high-scores-modal')!;
        const table = document.getElementById('high-scores-table')! as HTMLTableElement;
        const noScores = document.getElementById('no-scores')!;
        const tbody = document.getElementById('high-scores-list')!;
        
        // Pause game if it's running and not already paused
        this.wasGamePausedBeforeModal = this.isPaused;
        this.wasGameRunning = this.gameTimer !== null && !this.gameLogic.isGameOver();
        
        if (this.wasGameRunning && !this.isPaused) {
            this.togglePause();
        }
        
        const scores = this.getHighScores();
        const isNewScore = this.lastScoreEntry !== null;
        const isHighScore = isNewScore && scores.some(score => 
            score.time === this.lastScoreEntry!.time && 
            score.date === this.lastScoreEntry!.date
        );
        
        if (scores.length === 0 && !isNewScore) {
            table.style.display = 'none';
            noScores.style.display = 'block';
        } else {
            table.style.display = 'table';
            noScores.style.display = 'none';
            
            tbody.innerHTML = '';
            
            // Show top 10 scores
            scores.forEach((entry, index) => {
                const row = document.createElement('tr');
                const isThisNewScore = isNewScore && 
                    entry.time === this.lastScoreEntry!.time && 
                    entry.date === this.lastScoreEntry!.date;
                
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
                    <td>${this.lastScoreEntry!.time}</td>
                    <td>${this.lastScoreEntry!.date} (Not a high score)</td>
                `;
                tbody.appendChild(row);
            }
        }
        
        modal.style.display = 'flex';
    }
    
    private closeHighScoresModal(): void {
        const modal = document.getElementById('high-scores-modal')!;
        modal.style.display = 'none';
        
        // Resume game if it was running and not paused before modal opened
        if (this.wasGameRunning && !this.wasGamePausedBeforeModal && this.isPaused) {
            this.togglePause();
        }
    }

    private endGame(): void {
        if (this.gameEnded) return; // Prevent duplicate calls
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

    private saveHighScore(timeStr: string, setsFound: number): void {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        
        const scoreEntry: HighScoreEntry = {
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

    private getHighScores(): HighScoreEntry[] {
        const scores = localStorage.getItem('setGameHighScores');
        if (!scores) return [];
        
        const parsed = JSON.parse(scores);
        
        // Migration: Convert old string format to new object format
        if (parsed.length > 0 && typeof parsed[0] === 'string') {
            const migrated = parsed.map((scoreStr: string) => ({
                time: scoreStr.split(' ')[0], // Remove "(X sets)" part
                date: 'Jun 29, 2025',
                timeSeconds: this.parseTimeToSeconds(scoreStr.split(' ')[0])
            }));
            localStorage.setItem('setGameHighScores', JSON.stringify(migrated));
            return migrated;
        }
        
        return parsed;
    }

    private parseTimeToSeconds(timeStr: string): number {
        const [minutes, seconds] = timeStr.split(':').map(Number);
        return minutes * 60 + seconds;
    }

    private togglePause(): void {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseStartTime = Date.now();
            (this.pauseButton.querySelector('img') as HTMLImageElement).src = 'icons/play.svg';
            (this.pauseButton.querySelector('img') as HTMLImageElement).alt = 'Resume';
            this.pauseButton.title = 'Resume';
            this.showPauseOverlay();
        } else {
            this.pausedTime += Date.now() - this.pauseStartTime;
            (this.pauseButton.querySelector('img') as HTMLImageElement).src = 'icons/pause.svg';
            (this.pauseButton.querySelector('img') as HTMLImageElement).alt = 'Pause';
            this.pauseButton.title = 'Pause';
            this.hidePauseOverlay();
        }
    }

    private showPauseOverlay(): void {
        if (!this.pauseOverlay) {
            this.pauseOverlay = document.createElement('div');
            this.pauseOverlay.className = 'pause-overlay';
            this.pauseOverlay.innerHTML = '<div class="pause-text">PAUSED</div>';
            this.cardContainer.appendChild(this.pauseOverlay);
        }
        this.pauseOverlay.style.display = 'flex';
    }

    private hidePauseOverlay(): void {
        if (this.pauseOverlay) {
            this.pauseOverlay.style.display = 'none';
        }
    }
} 