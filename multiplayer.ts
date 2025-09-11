import { Card } from './card.js';
import { GameLogic } from './gameLogic.js';

interface Player {
    id: string;
    name: string;
    score: number;
    isActive: boolean;
    setsFound: number;
}

interface ActionMessage {
    id: string;
    text: string;
    playerName?: string;
    timestamp: number;
    type: 'set_found' | 'player_joined' | 'player_left' | 'game_started' | 'game_ended' | 'error' | 'info';
}

export class MultiplayerSetGame {
    private gameLogic: GameLogic;
    private players: Map<string, Player> = new Map();
    private currentPlayerId: string | null = null;
    private actionMessages: ActionMessage[] = [];
    private startTime: number = 0;
    private gameTimer: ReturnType<typeof setInterval> | null = null;
    private isPaused: boolean = false;
    private pausedTime: number = 0;
    private pauseStartTime: number = 0;
    private gameEnded: boolean = false;
    private imageCache: Map<number, HTMLImageElement> = new Map();
    private updateTimeout: number | null = null;
    
    // DOM elements
    private playersContainer!: HTMLElement;
    private cardContainer!: HTMLElement;
    private actionBar!: HTMLElement;
    private actionMessagesElement!: HTMLElement;
    private totalSetsElement!: HTMLElement;
    private timerElement!: HTMLElement;
    private newGameButton!: HTMLButtonElement;
    private pauseButton!: HTMLButtonElement;
    private addPlayerButton!: HTMLButtonElement;
    private playerModal!: HTMLElement;

    constructor() {
        this.gameLogic = new GameLogic();
        this.preloadImages().then(() => {
            this.initializeUI();
            this.initializeDefaultPlayers();
            this.startNewGame();
        });
    }

    private async preloadImages(): Promise<void> {
        const imagePromises: Promise<void>[] = [];
        
        for (let i = 1; i <= 81; i++) {
            const img = new Image();
            const promise = new Promise<void>((resolve, reject) => {
                img.onload = () => {
                    this.imageCache.set(i, img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load image for card ${i}`);
                    resolve();
                };
            });
            
            img.src = `cards/${i}.png`;
            imagePromises.push(promise);
        }
        
        await Promise.all(imagePromises);
        console.log(`Preloaded ${this.imageCache.size} card images`);
    }

    private initializeUI(): void {
        this.playersContainer = document.getElementById('players-container')!;
        this.cardContainer = document.getElementById('card-container')!;
        this.actionBar = document.getElementById('action-bar')!;
        this.actionMessagesElement = document.getElementById('action-messages')!;
        this.totalSetsElement = document.getElementById('total-sets')!;
        this.timerElement = document.getElementById('timer')!;
        this.newGameButton = document.getElementById('new-game-btn')! as HTMLButtonElement;
        this.pauseButton = document.getElementById('pause-btn')! as HTMLButtonElement;
        this.addPlayerButton = document.getElementById('add-player-btn')! as HTMLButtonElement;
        this.playerModal = document.getElementById('player-modal')!;

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.newGameButton.addEventListener('click', () => this.startNewGame());
        this.pauseButton.addEventListener('click', () => this.togglePause());
        this.addPlayerButton.addEventListener('click', () => this.showPlayerModal());

        // Modal close functionality
        document.getElementById('close-player-modal')!.addEventListener('click', () => this.closePlayerModal());
        
        this.playerModal.addEventListener('click', (e) => {
            if (e.target === this.playerModal) this.closePlayerModal();
        });

        // Add player functionality
        document.getElementById('add-player-confirm')!.addEventListener('click', () => this.addPlayer());
        document.getElementById('add-player-sidebar-btn')!.addEventListener('click', () => this.showPlayerModal());
        document.getElementById('new-player-name')!.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addPlayer();
        });
    }

    private initializeDefaultPlayers(): void {
        // Add 2 default players to start
        this.addPlayer('Player 1');
        this.addPlayer('Player 2');
    }

    private addPlayer(name?: string): void {
        if (this.players.size >= 12) {
            this.showActionMessage('Maximum 12 players allowed', 'error');
            return;
        }

        const playerName = name || (document.getElementById('new-player-name') as HTMLInputElement).value.trim();
        if (!playerName) {
            this.showActionMessage('Please enter a player name', 'error');
            return;
        }

        const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const player: Player = {
            id: playerId,
            name: playerName,
            score: 0,
            isActive: false,
            setsFound: 0
        };

        this.players.set(playerId, player);
        this.updatePlayersDisplay();
        this.showActionMessage(`${playerName} joined the game`, 'player_joined');
        
        // Clear input
        (document.getElementById('new-player-name') as HTMLInputElement).value = '';
        
        // Close modal if it was opened via the add button
        if (this.playerModal.style.display !== 'none') {
            this.closePlayerModal();
        }
    }

    private removePlayer(playerId: string): void {
        const player = this.players.get(playerId);
        if (!player) return;

        this.players.delete(playerId);
        
        // If this was the current player, switch to another player
        if (this.currentPlayerId === playerId) {
            const remainingPlayers = Array.from(this.players.values());
            this.currentPlayerId = remainingPlayers.length > 0 ? remainingPlayers[0].id : null;
        }

        this.updatePlayersDisplay();
        this.showActionMessage(`${player.name} left the game`, 'player_left');
    }

    private updatePlayersDisplay(): void {
        this.playersContainer.innerHTML = '';
        
        this.players.forEach((player) => {
            const playerCard = this.createPlayerCard(player);
            this.playersContainer.appendChild(playerCard);
        });
    }

    private createPlayerCard(player: Player): HTMLElement {
        const item = document.createElement('div');
        item.className = `player-item ${player.id === this.currentPlayerId ? 'active' : ''}`;
        item.dataset.playerId = player.id;

        item.innerHTML = `
            <span class="player-name">${player.name}</span>
            <span class="player-score">${player.setsFound}</span>
        `;

        // Click to activate player
        item.addEventListener('click', () => {
            this.setCurrentPlayer(player.id);
        });

        return item;
    }

    private setCurrentPlayer(playerId: string): void {
        this.currentPlayerId = playerId;
        this.updatePlayersDisplay();
        this.showActionMessage(`${this.players.get(playerId)?.name} is now active`, 'info');
    }

    private startNewGame(): void {
        this.gameLogic.startNewGame();
        this.isPaused = false;
        this.pausedTime = 0;
        this.pauseStartTime = 0;
        this.gameEnded = false;
        this.actionMessages = [];
        this.updateActionBar();

        // Reset all player scores
        this.players.forEach(player => {
            player.setsFound = 0;
            player.score = 0;
        });

        this.updatePlayersDisplay();
        this.showActionMessage('New game started!', 'game_started');
        
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
        if (this.updateTimeout) {
            cancelAnimationFrame(this.updateTimeout);
            this.updateTimeout = null;
        }
        
        this.updateTimeout = requestAnimationFrame(() => {
            this.updateStatus();
            this.updateCards();
            
            if (this.gameLogic.isGameOver()) {
                this.endGame();
            }
            this.updateTimeout = null;
        }) as any;
    }

    private updateStatus(): void {
        const totalSets = Array.from(this.players.values()).reduce((sum, player) => sum + player.setsFound, 0);
        this.totalSetsElement.textContent = totalSets.toString();
    }

    private updateCards(): void {
        const displayedCards = this.gameLogic.getDisplayedCards();
        const selectedCards = this.gameLogic.getSelectedCards();
        
        this.adjustGridLayout(displayedCards.length);
        this.updateCardsWithDiffing(displayedCards, selectedCards);
    }

    private updateCardsWithDiffing(displayedCards: Card[], selectedCards: Set<Card>): void {
        const existingCards = Array.from(this.cardContainer.children) as HTMLElement[];
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
                const cardElement = this.createCardElement(card, isSelected);
                if (index < this.cardContainer.children.length) {
                    this.cardContainer.insertBefore(cardElement, this.cardContainer.children[index]);
                } else {
                    this.cardContainer.appendChild(cardElement);
                }
            } else {
                const existingEl = existingCards[existingIndex];
                const currentlySelected = existingEl.classList.contains('selected');
                if (currentlySelected !== isSelected) {
                    if (isSelected) {
                        existingEl.classList.add('selected');
                    } else {
                        existingEl.classList.remove('selected');
                    }
                }
                
                const currentPosition = Array.from(this.cardContainer.children).indexOf(existingEl);
                if (currentPosition !== index) {
                    if (index < this.cardContainer.children.length) {
                        this.cardContainer.insertBefore(existingEl, this.cardContainer.children[index]);
                    } else {
                        this.cardContainer.appendChild(existingEl);
                    }
                }
            }
        });
    }

    private adjustGridLayout(cardCount: number): void {
        this.cardContainer.className = this.cardContainer.className.replace(/\bgrid-\d+-cols\b/g, '');
        
        let gridClass = '';
        if (cardCount <= 12) {
            gridClass = 'grid-4-cols';
        } else if (cardCount <= 15) {
            gridClass = 'grid-5-cols';
        } else {
            gridClass = 'grid-6-cols';
        }
        
        this.cardContainer.classList.add(gridClass);
        console.log(`Applied grid class: ${gridClass} for ${cardCount} cards`);
    }

    private createCardElement(card: Card, isSelected: boolean): HTMLElement {
        const cardDiv = document.createElement('div');
        cardDiv.className = `minimal-card ${isSelected ? 'selected' : ''}`;
        cardDiv.dataset.cardId = card.getId().toString();
        
        const cardId = card.getId();
        const cachedImg = this.imageCache.get(cardId);
        
        const img = document.createElement('img');
        img.alt = card.toString();
        img.draggable = false;
        
        if (cachedImg) {
            img.src = cachedImg.src;
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        } else {
            img.src = `cards/${cardId}.png`;
        }
        
        cardDiv.appendChild(img);
        
        cardDiv.addEventListener('click', () => {
            if (!this.isPaused && this.currentPlayerId) {
                const wasSet = this.handleCardSelection(card);
                
                if (wasSet) {
                    this.autoDealIfNoSet();
                }
                
                this.updateDisplay();
            }
        });
        
        return cardDiv;
    }

    private handleCardSelection(card: Card): boolean {
        if (!this.currentPlayerId) return false;

        const beforeSetsFound = this.gameLogic.getSetsFound();
        this.gameLogic.selectCard(card);
        const afterSetsFound = this.gameLogic.getSetsFound();
        
        if (afterSetsFound > beforeSetsFound) {
            // A set was found by the current player
            const player = this.players.get(this.currentPlayerId);
            if (player) {
                player.setsFound++;
                player.score += 10; // Points for finding a set
                this.showActionMessage(`${player.name} found a SET! (+10 points)`, 'set_found', player.name);
                this.updatePlayersDisplay();
            }
            return true;
        }
        
        return false;
    }

    private autoDealIfNoSet(): void {
        while (!this.gameLogic.hasVisibleSet() && this.gameLogic.getRemainingCards() > 0) {
            this.gameLogic.dealMoreCards();
        }
    }

    private showActionMessage(text: string, type: ActionMessage['type'], playerName?: string): void {
        const message: ActionMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            text,
            playerName,
            timestamp: Date.now(),
            type
        };

        this.actionMessages.push(message);
        
        // Keep only last 10 messages
        if (this.actionMessages.length > 10) {
            this.actionMessages = this.actionMessages.slice(-10);
        }

        this.updateActionBar();
    }

    private updateActionBar(): void {
        if (this.actionMessages.length === 0) {
            this.actionBar.style.display = 'none';
            return;
        }

        this.actionBar.style.display = 'block';
        this.actionMessagesElement.innerHTML = '';
        
        this.actionMessages.slice(-3).forEach(message => {
            const messageEl = document.createElement('div');
            messageEl.className = 'action-message';
            messageEl.textContent = message.text;
            this.actionMessagesElement.appendChild(messageEl);
        });

        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.actionBar.style.display = 'none';
        }, 3000);
    }

    private endGame(): void {
        if (this.gameEnded) return;
        this.gameEnded = true;
        
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
        }

        // Find winner
        const players = Array.from(this.players.values());
        const winner = players.reduce((prev, current) => 
            (current.setsFound > prev.setsFound) ? current : prev
        );

        this.showActionMessage(`Game Over! ${winner.name} wins with ${winner.setsFound} sets!`, 'game_ended');
        
        // Update player cards to show winner
        this.updatePlayersDisplay();
    }

    private togglePause(): void {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseStartTime = Date.now();
            (this.pauseButton.querySelector('img') as HTMLImageElement).src = 'icons/play.svg';
            (this.pauseButton.querySelector('img') as HTMLImageElement).alt = 'Resume';
            this.pauseButton.title = 'Resume';
        } else {
            this.pausedTime += Date.now() - this.pauseStartTime;
            (this.pauseButton.querySelector('img') as HTMLImageElement).src = 'icons/pause.svg';
            (this.pauseButton.querySelector('img') as HTMLImageElement).alt = 'Pause';
            this.pauseButton.title = 'Pause';
        }
    }

    private showPlayerModal(): void {
        this.updatePlayerModal();
        this.playerModal.style.display = 'flex';
    }

    private closePlayerModal(): void {
        this.playerModal.style.display = 'none';
    }

    private updatePlayerModal(): void {
        const playerList = document.getElementById('player-list')!;
        playerList.innerHTML = '';

        this.players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-list-item';
            item.innerHTML = `
                <span>${player.name} (${player.setsFound} sets)</span>
                <button class="remove-btn" onclick="multiplayerGame.removePlayer('${player.id}')">Remove</button>
            `;
            playerList.appendChild(item);
        });
    }
}

// Initialize the multiplayer game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    (window as any).multiplayerGame = new MultiplayerSetGame();
});

