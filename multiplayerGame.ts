import { Card } from './card.js';
import { getProfileName, setProfileName, generateRandomName, getMultiplayerWins, setMultiplayerWins, incrementMultiplayerWins } from './profileUtils.js';

interface Player {
    id: number;
    name: string;
    setsFound: number;
    selectedCards: number[];
    totalWins: number;
}

interface GameState {
    displayedCards: any[];
    players: Player[];
    deckRemaining: number;
    gameId: number;
}

export class MultiplayerSetGame {
    private ws: WebSocket | null = null;
    private playerId: number | null = null;
    private playerName: string = '';
    private selectedCards: Set<number> = new Set();
    private currentGameId: number | null = null;
    private imageCache: Map<number, HTMLImageElement> = new Map();
    private changeNameHandler: (() => void) | null = null;
    
    // DOM elements
    private gameContent!: HTMLElement;
    private playerNameElement!: HTMLElement;
    private changeNameButton!: HTMLButtonElement;
    private bestTimesButton!: HTMLButtonElement;

    private playersContainer!: HTMLElement;
    private cardContainer!: HTMLElement;
    private recentSetsContainer!: HTMLElement;
    
    constructor() {
        this.preloadImages().then(() => {
            this.initializeUI();
            this.setupWebSocket();
        });
    }
    
    private async preloadImages(): Promise<void> {
        const imagePromises: Promise<void>[] = [];
        
        // Preload all 81 card images
        for (let i = 1; i <= 81; i++) {
            const img = new Image();
            const promise = new Promise<void>((resolve) => {
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
        // Get DOM elements
        this.gameContent = document.getElementById('game-content')!;
        this.playerNameElement = document.getElementById('player-name')!;
        this.changeNameButton = document.getElementById('change-name-btn')! as HTMLButtonElement;
        this.bestTimesButton = document.getElementById('best-times-btn')! as HTMLButtonElement;

        this.playersContainer = document.getElementById('players-container')!;
        this.cardContainer = document.getElementById('card-container')!;
        this.recentSetsContainer = document.getElementById('recent-sets-container')!;
        
        // Setup event listeners
        this.changeNameButton.addEventListener('click', () => this.showChangeNameDialog());
        this.bestTimesButton.addEventListener('click', () => this.showBestTimesModal());
        
        // Modal close functionality
        const modal = document.getElementById('high-scores-modal')!;
        const closeModal = document.getElementById('close-modal')!;
        closeModal.addEventListener('click', () => { this.closeBestTimesModal(); });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeBestTimesModal();
        });
        
        // Global escape key handler for modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Check if best times modal is open
                if (modal.style.display === 'flex') {
                    this.closeBestTimesModal();
                }
            }
        });
        
        // Initialize profile
        this.initializeProfile();
    }
    
    private initializeProfile(): void {
        this.playerName = getProfileName();
        this.playerNameElement.textContent = this.playerName;
        
        // Show the profile section now that we have the name
        const profileSection = document.querySelector('.profile-section') as HTMLElement;
        if (profileSection) {
            profileSection.classList.add('loaded');
        }
    }
    
    private setupWebSocket(): void {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.joinGame();
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            this.showNotification('Disconnected from server', true);
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showNotification('Connection error', true);
        };
    }
    
    private joinGame(): void {
        if (this.playerName && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'join',
                name: this.playerName
            }));
        }
    }
    
    private handleServerMessage(data: any): void {
        switch (data.type) {
            case 'playerId':
                this.playerId = data.playerId;
                this.showGame();
                break;
                
            case 'gameState':
                this.updateGameState(data);
                break;
                
            case 'setFound':
                this.handleSetFound(data);
                break;
                
            case 'invalidSet':
                this.showNotification('Invalid set!', true);
                break;
        }
    }
    
    private showGame(): void {
        this.playerNameElement.textContent = this.playerName;
    }
    
    private updateGameState(state: GameState): void {
        // Check if this is a new game
        if (this.currentGameId !== null && this.currentGameId !== state.gameId) {
            this.showNotification('New game started!', false);
        }
        this.currentGameId = state.gameId;
        

        
        // Update players list
        this.updatePlayersList(state.players);
        
        // Update cards
        this.updateCards(state.displayedCards, state.players);
        
        // Update current player multiplayer wins in localStorage
        const currentPlayer = state.players.find(p => p.id === this.playerId);
        if (currentPlayer) {
            // Keep localStorage in sync with server state
            const currentStoredWins = getMultiplayerWins();
            if (currentPlayer.totalWins > currentStoredWins) {
                setMultiplayerWins(currentPlayer.totalWins);
            }
        }
    }
    
    private updatePlayersList(players: Player[]): void {
        this.playersContainer.innerHTML = '';
        
        // Sort players by sets found (descending)
        const sortedPlayers = [...players].sort((a, b) => b.setsFound - a.setsFound);
        
        sortedPlayers.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            if (player.id === this.playerId) {
                playerDiv.classList.add('current-player');
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.name;
            
            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'player-score';
            scoreSpan.textContent = player.setsFound.toString();
            
            playerDiv.appendChild(nameSpan);
            playerDiv.appendChild(scoreSpan);
            this.playersContainer.appendChild(playerDiv);
        });
    }
    
    private updateCards(displayedCards: any[], players: Player[]): void {
        // Adjust grid layout
        this.adjustGridLayout(displayedCards.length);
        
        // Get all selected cards from other players
        const otherPlayersSelected = new Set<number>();
        players.forEach(player => {
            if (player.id !== this.playerId) {
                player.selectedCards.forEach(cardId => otherPlayersSelected.add(cardId));
            }
        });
        
        // Clear and rebuild cards
        this.cardContainer.innerHTML = '';
        
        displayedCards.forEach(cardData => {
            const cardDiv = this.createCardElement(
                cardData,
                this.selectedCards.has(cardData.id),
                otherPlayersSelected.has(cardData.id)
            );
            this.cardContainer.appendChild(cardDiv);
        });
    }
    
    private adjustGridLayout(cardCount: number): void {
        this.cardContainer.className = 'card-container';
        
        if (cardCount <= 12) {
            this.cardContainer.classList.add('grid-4-cols');
        } else if (cardCount <= 15) {
            this.cardContainer.classList.add('grid-5-cols');
        } else {
            this.cardContainer.classList.add('grid-6-cols');
        }
    }
    
    private createCardElement(cardData: any, isSelected: boolean, isOtherPlayerSelected: boolean): HTMLElement {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card';
        if (isSelected) {
            cardDiv.classList.add('selected');
        }
        if (isOtherPlayerSelected) {
            cardDiv.classList.add('other-player-selected');
        }
        
        const img = document.createElement('img');
        img.alt = `Card ${cardData.id}`;
        img.draggable = false;
        
        const cachedImg = this.imageCache.get(cardData.id);
        if (cachedImg) {
            img.src = cachedImg.src;
            img.width = cachedImg.width;
            img.height = cachedImg.height;
        } else {
            img.src = `cards/${cardData.id}.png`;
        }
        
        cardDiv.appendChild(img);
        
        cardDiv.addEventListener('click', () => {
            this.handleCardClick(cardData.id);
        });
        
        return cardDiv;
    }
    
    private handleCardClick(cardId: number): void {
        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
        } else {
            this.selectedCards.add(cardId);
            
            // If 3 cards selected, check for set
            if (this.selectedCards.size >= 3) {
                // Only send the first 3 cards
                const cardsArray = Array.from(this.selectedCards).slice(0, 3);
                this.sendSelectedCards(cardsArray);
                this.selectedCards.clear();
            }
        }
        
        // Send current selection to server
        this.sendSelectedCards(Array.from(this.selectedCards));
    }
    
    private sendSelectedCards(cardIds: number[]): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'selectCards',
                cardIds: cardIds
            }));
        }
    }
    
    private handleSetFound(data: { playerName: string; playerId: number; cards?: any[] }): void {
        if (data.playerId === this.playerId) {
            this.showNotification('Set found! +1 point', false);
            // Increment multiplayer wins in localStorage
            incrementMultiplayerWins();
        } else {
            this.showNotification(`${data.playerName} found a set!`, false);
        }
        
        // Add to recent sets with card data
        this.addRecentSet(data.playerName, data.playerId === this.playerId, data.cards);
    }
    
    private showChangeNameDialog(): void {
        const currentName = this.playerName;
        const newName = prompt('Enter your name (or leave empty for a random name):', currentName);
        
        if (newName !== null) {
            let finalName: string;
            if (newName.trim() === '') {
                // Generate a new random name
                finalName = generateRandomName();
            } else {
                finalName = newName.trim();
            }
            
            if (finalName !== this.playerName) {
                this.playerName = finalName;
                this.playerNameElement.textContent = finalName;
                setProfileName(finalName);
                
                // Send name change to server
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'changeName',
                        name: finalName
                    }));
                }
                
                this.showNotification('Name changed successfully!', false);
            }
        }
    }
    
        private addRecentSet(playerName: string, isCurrentPlayer: boolean, cards?: any[]): void {
        // Remove "no sets" message if it exists
        const noSets = this.recentSetsContainer.querySelector('.no-sets');
        if (noSets) {
            noSets.remove();
        }

        // Create new set entry
        const setEntry = document.createElement('div');
        setEntry.className = 'set-entry';
        if (isCurrentPlayer) {
            setEntry.classList.add('current-player-set');
        }

        // Create cards container
        if (cards && cards.length === 3) {
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'set-cards';
            
            cards.forEach(card => {
                const cardImg = document.createElement('img');
                cardImg.src = `cards/${card.id}.png`;
                cardImg.alt = `Card ${card.id}`;
                cardImg.className = 'set-card-img';
                cardsContainer.appendChild(cardImg);
            });
            
            setEntry.appendChild(cardsContainer);
        }

        // Add to top of list
        this.recentSetsContainer.insertBefore(setEntry, this.recentSetsContainer.firstChild);

        // Keep only last 10 sets
        const entries = this.recentSetsContainer.querySelectorAll('.set-entry');
        if (entries.length > 10) {
            entries[entries.length - 1].remove();
        }
    }
    
    private showNotification(message: string, isError: boolean): void {
        const notification = document.createElement('div');
        notification.className = 'notification';
        if (isError) {
            notification.classList.add('error');
        }
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    private showBestTimesModal(): void {
        const modal = document.getElementById('high-scores-modal')!;
        const table = document.getElementById('high-scores-table')! as HTMLTableElement;
        const noScores = document.getElementById('no-scores')!;
        const tbody = document.getElementById('high-scores-list')!;
        const mpWinsDisplay = document.getElementById('mp-wins-display')!;
        
        // Update multiplayer wins display
        mpWinsDisplay.textContent = getMultiplayerWins().toString();
        
        // Get high scores from single-player mode
        const scores = this.getHighScores();
        
        if (scores.length === 0) {
            table.style.display = 'none';
            noScores.style.display = 'block';
        } else {
            table.style.display = 'table';
            noScores.style.display = 'none';
            
            tbody.innerHTML = '';
            
            // Show top 10 scores
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

    private getHighScores(): any[] {
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

    private closeBestTimesModal(): void {
        const modal = document.getElementById('high-scores-modal')!;
        modal.style.display = 'none';
    }
}