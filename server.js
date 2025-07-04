const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('.'));

// Serve the multiplayer page at /m
app.get('/m', (req, res) => {
    res.sendFile(path.join(__dirname, 'multiplayer.html'));
});

// Game state
const gameState = {
    deck: [],
    displayedCards: [],
    players: new Map(), // Map of playerId to player data
    playerWins: new Map(), // Map of playerName to total wins (persistent)
    gameId: Date.now()
};

// Card enums (matching the TypeScript enums)
const CardNumber = { ONE: 'ONE', TWO: 'TWO', THREE: 'THREE' };
const CardShape = { DIAMOND: 'DIAMOND', SQUIGGLE: 'SQUIGGLE', OVAL: 'OVAL' };
const CardShading = { SOLID: 'SOLID', STRIPED: 'STRIPED', OPEN: 'OPEN' };
const CardColor = { RED: 'RED', GREEN: 'GREEN', PURPLE: 'PURPLE' };

// Initialize deck
function initializeDeck() {
    const deck = [];
    let id = 1;
    for (const number of Object.values(CardNumber)) {
        for (const shape of Object.values(CardShape)) {
            for (const shading of Object.values(CardShading)) {
                for (const color of Object.values(CardColor)) {
                    deck.push({
                        number,
                        shape,
                        shading,
                        color,
                        id: id++
                    });
                }
            }
        }
    }
    return deck;
}

// Shuffle deck
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Check if three cards form a valid set
function isValidSet(card1, card2, card3) {
    const isValidFeature = (f1, f2, f3) => {
        return (f1 === f2 && f2 === f3) || 
               (f1 !== f2 && f2 !== f3 && f1 !== f3);
    };
    
    return isValidFeature(card1.number, card2.number, card3.number) &&
           isValidFeature(card1.shape, card2.shape, card3.shape) &&
           isValidFeature(card1.shading, card2.shading, card3.shading) &&
           isValidFeature(card1.color, card2.color, card3.color);
}

// Check if there's a visible set
function hasVisibleSet(cards) {
    for (let i = 0; i < cards.length - 2; i++) {
        for (let j = i + 1; j < cards.length - 1; j++) {
            for (let k = j + 1; k < cards.length; k++) {
                if (isValidSet(cards[i], cards[j], cards[k])) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Deal initial cards
function dealInitialCards() {
    gameState.displayedCards = [];
    for (let i = 0; i < 12 && gameState.deck.length > 0; i++) {
        gameState.displayedCards.push(gameState.deck.pop());
    }
}

// Deal more cards
function dealMoreCards() {
    for (let i = 0; i < 3 && gameState.deck.length > 0; i++) {
        gameState.displayedCards.push(gameState.deck.pop());
    }
}

// Initialize game
function initializeGame() {
    gameState.deck = shuffleDeck(initializeDeck());
    gameState.displayedCards = [];
    gameState.gameId = Date.now();
    dealInitialCards();
    
    // Auto-deal if no set visible
    while (!hasVisibleSet(gameState.displayedCards) && gameState.deck.length > 0) {
        dealMoreCards();
    }
}

// Initialize the game when server starts
initializeGame();

// Broadcast game state to all players
function broadcastGameState() {
    const state = {
        type: 'gameState',
        displayedCards: gameState.displayedCards,
        players: Array.from(gameState.players.values()),
        deckRemaining: gameState.deck.length,
        gameId: gameState.gameId
    };
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(state));
        }
    });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    let playerId = null;
    let playerName = null;
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'join':
                playerId = Date.now() + Math.random();
                playerName = data.name;
                gameState.players.set(playerId, {
                    id: playerId,
                    name: playerName,
                    setsFound: 0,
                    selectedCards: [],
                    totalWins: gameState.playerWins.get(playerName) || 0
                });
                
                // Send player their ID
                ws.send(JSON.stringify({
                    type: 'playerId',
                    playerId: playerId
                }));
                
                broadcastGameState();
                break;
                
            case 'changeName':
                if (!playerId || !gameState.players.has(playerId)) break;
                
                const newName = data.name;
                const playerToUpdate = gameState.players.get(playerId);
                const oldName = playerToUpdate.name;
                
                // Update player name
                playerToUpdate.name = newName;
                
                // Update total wins mapping
                const wins = gameState.playerWins.get(oldName) || 0;
                gameState.playerWins.delete(oldName);
                gameState.playerWins.set(newName, wins);
                playerToUpdate.totalWins = wins;
                
                // Update playerName variable for this connection
                playerName = newName;
                
                broadcastGameState();
                break;
                
            case 'selectCards':
                if (!playerId || !gameState.players.has(playerId)) break;
                
                const player = gameState.players.get(playerId);
                const selectedIds = data.cardIds;
                
                if (selectedIds.length === 3) {
                    // Find the actual card objects
                    const selectedCards = selectedIds.map(id => 
                        gameState.displayedCards.find(card => card.id === id)
                    ).filter(card => card !== undefined);
                    
                    if (selectedCards.length === 3 && isValidSet(selectedCards[0], selectedCards[1], selectedCards[2])) {
                        // Valid set found!
                        player.setsFound++;
                        player.selectedCards = [];
                        
                        // Update total wins
                        const currentWins = gameState.playerWins.get(playerName) || 0;
                        gameState.playerWins.set(playerName, currentWins + 1);
                        player.totalWins = currentWins + 1;
                        
                        // Remove cards from display
                        const indices = selectedIds.map(id => 
                            gameState.displayedCards.findIndex(card => card.id === id)
                        ).sort((a, b) => b - a);
                        
                        // Handle card replacement
                        if (gameState.displayedCards.length > 12) {
                            // Just remove the cards
                            for (const idx of indices) {
                                gameState.displayedCards.splice(idx, 1);
                            }
                        } else {
                            // Replace with new cards if available
                            for (const idx of indices) {
                                if (gameState.deck.length > 0) {
                                    gameState.displayedCards[idx] = gameState.deck.pop();
                                } else {
                                    gameState.displayedCards.splice(idx, 1);
                                }
                            }
                        }
                        
                        // Auto-deal if no set visible
                        while (!hasVisibleSet(gameState.displayedCards) && gameState.deck.length > 0) {
                            dealMoreCards();
                        }
                        
                        // Check if game is over
                        if (gameState.deck.length === 0 && !hasVisibleSet(gameState.displayedCards)) {
                            // Game over - start a new game automatically
                            setTimeout(() => {
                                initializeGame();
                                // Reset player scores for new game but keep total wins
                                gameState.players.forEach(p => {
                                    p.setsFound = 0;
                                    p.selectedCards = [];
                                });
                                broadcastGameState();
                            }, 3000);
                        }
                        
                        // Send set found notification with card data
                        wss.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'setFound',
                                    playerName: playerName,
                                    playerId: playerId,
                                    cards: selectedCards // Include the actual card data
                                }));
                            }
                        });
                    } else {
                        // Invalid set
                        player.selectedCards = [];
                        ws.send(JSON.stringify({
                            type: 'invalidSet'
                        }));
                    }
                } else {
                    // Update selected cards
                    player.selectedCards = selectedIds;
                }
                
                broadcastGameState();
                break;
        }
    });
    
    ws.on('close', () => {
        if (playerId) {
            gameState.players.delete(playerId);
            broadcastGameState();
        }
    });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Multiplayer game available at http://localhost:${PORT}/m`);
});