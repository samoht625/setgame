import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? ['https://setgame.onrender.com'] 
            : ['http://localhost:8000', 'http://127.0.0.1:8000'],
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://setgame.onrender.com'] 
        : true,
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

// Serve static files from the project root directory
app.use(express.static(__dirname));

// Handle dynamic room URLs - serve the multiplayer page for any /m/:room route
app.get('/m/:room', (req, res) => {
    res.sendFile(path.join(__dirname, 'multiplayer-clean.html'));
});

// Handle root multiplayer route
app.get('/m', (req, res) => {
    res.sendFile(path.join(__dirname, 'multiplayer-clean.html'));
});

// Store rooms in memory
const rooms = new Map();

// Room management
class RoomManager {
    constructor() {
        this.MAX_PLAYERS_PER_ROOM = 12;
        this.adjectives = ['happy', 'bright', 'clever', 'swift', 'brave', 'calm', 'wise', 'bold', 'kind', 'gentle'];
        this.nouns = ['tiger', 'eagle', 'wolf', 'bear', 'fox', 'lion', 'hawk', 'deer', 'owl', 'raven'];
    }

    findAvailableRoom() {
        // Look for existing rooms that aren't full, preferring rooms with fewer players
        let bestRoom = null;
        let minPlayers = this.MAX_PLAYERS_PER_ROOM;
        
        for (const [roomCode, room] of rooms) {
            if (room.players.length < this.MAX_PLAYERS_PER_ROOM && room.players.length < minPlayers) {
                bestRoom = roomCode;
                minPlayers = room.players.length;
            }
        }
        
        if (bestRoom) {
            return bestRoom;
        }
        
        // Create a new room
        return this.createNewRoom();
    }

    createNewRoom() {
        let roomCode;
        do {
            const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
            const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
            roomCode = `${adjective}-${noun}`;
        } while (rooms.has(roomCode));
        
        rooms.set(roomCode, {
            roomCode,
            players: [],
            gameState: {
                cards: [],
                selectedCards: [],
                gamePhase: 'waiting',
                setsFound: 0
            }
        });
        
        return roomCode;
    }

    generatePlayerName(existingPlayers) {
        const existingNames = existingPlayers.map(p => p.name);
        let playerNumber = 1;
        
        while (existingNames.includes(`Player ${playerNumber}`)) {
            playerNumber++;
        }
        
        return `Player ${playerNumber}`;
    }

    getRoom(roomCode) {
        return rooms.get(roomCode);
    }

    addPlayerToRoom(roomCode, player) {
        const room = rooms.get(roomCode);
        if (room) {
            room.players.push(player);
            return true;
        }
        return false;
    }

    removePlayerFromRoom(roomCode, playerId) {
        const room = rooms.get(roomCode);
        if (room) {
            room.players = room.players.filter(p => p.id !== playerId);
            return true;
        }
        return false;
    }

    updatePlayerInRoom(roomCode, playerId, updates) {
        const room = rooms.get(roomCode);
        if (room) {
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                Object.assign(player, updates);
                return true;
            }
        }
        return false;
    }
}

const roomManager = new RoomManager();

// Game logic for Set cards
class SetGameLogic {
    constructor() {
        this.cards = this.generateAllCards();
    }

    generateAllCards() {
        const cards = [];
        const colors = ['RED', 'GREEN', 'PURPLE'];
        const shapes = ['DIAMOND', 'SQUIGGLE', 'OVAL'];
        const numbers = ['ONE', 'TWO', 'THREE'];
        const shadings = ['SOLID', 'STRIPED', 'OPEN'];

        let id = 1;
        for (const color of colors) {
            for (const shape of shapes) {
                for (const number of numbers) {
                    for (const shading of shadings) {
                        cards.push({
                            id,
                            color,
                            shape,
                            number,
                            shading
                        });
                        id++;
                    }
                }
            }
        }
        return cards;
    }

    dealCards(count = 12) {
        const shuffled = [...this.cards].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    isValidSet(card1, card2, card3) {
        const features = ['color', 'shape', 'number', 'shading'];
        
        for (const feature of features) {
            const values = [card1[feature], card2[feature], card3[feature]];
            const uniqueValues = new Set(values);
            
            // Valid if all same (1 unique value) or all different (3 unique values)
            if (uniqueValues.size !== 1 && uniqueValues.size !== 3) {
                return false;
            }
        }
        
        return true;
    }

    findValidSets(cards) {
        const validSets = [];
        
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                for (let k = j + 1; k < cards.length; k++) {
                    const card1 = cards[i];
                    const card2 = cards[j];
                    const card3 = cards[k];
                    
                    if (this.isValidSet(card1, card2, card3)) {
                        validSets.push([card1.id, card2.id, card3.id]);
                    }
                }
            }
        }
        
        return validSets;
    }
}

const gameLogic = new SetGameLogic();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join_room', (data) => {
        const { roomCode, playerName } = data;
        
        // Find or create room
        let targetRoom = roomCode;
        if (!roomCode || !rooms.has(roomCode)) {
            targetRoom = roomManager.findAvailableRoom();
        }
        
        const room = rooms.get(targetRoom);
        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        // Create player
        const player = {
            id: socket.id,
            name: playerName || roomManager.generatePlayerName(room.players),
            setsFound: 0,
            score: 0
        };

        // Add player to room
        roomManager.addPlayerToRoom(targetRoom, player);
        socket.join(targetRoom);

        // Notify all players in room
        io.to(targetRoom).emit('room_joined', {
            roomCode: targetRoom,
            players: room.players,
            gameState: room.gameState
        });

        console.log(`Player ${player.name} joined room ${targetRoom}`);
    });

    socket.on('start_game', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);
        
        if (!room) return;

        // Deal cards and start game
        room.gameState.cards = gameLogic.dealCards(12);
        room.gameState.selectedCards = [];
        room.gameState.gamePhase = 'playing';
        room.gameState.setsFound = 0;

        io.to(roomCode).emit('game_started', {
            gameState: room.gameState
        });

        console.log(`Game started in room ${roomCode}`);
    });

    socket.on('select_card', (data) => {
        const { roomCode, cardId } = data;
        const room = rooms.get(roomCode);
        
        if (!room || room.gameState.gamePhase !== 'playing') return;

        const selectedCards = room.gameState.selectedCards;
        
        if (selectedCards.includes(cardId)) {
            // Deselect card
            room.gameState.selectedCards = selectedCards.filter(id => id !== cardId);
        } else {
            // Select card
            room.gameState.selectedCards = [...selectedCards, cardId];
            
            // Check for set if 3 cards selected
            if (room.gameState.selectedCards.length === 3) {
                const selectedCardObjects = room.gameState.selectedCards.map(id => 
                    room.gameState.cards.find(card => card.id === id)
                ).filter(Boolean);
                
                if (selectedCardObjects.length === 3 && gameLogic.isValidSet(...selectedCardObjects)) {
                    // Valid set found
                    const setCardIds = selectedCardObjects.map(card => card.id);
                    room.gameState.setsFound++;
                    room.gameState.selectedCards = [];
                    
                    // Remove the 3 cards and deal 3 new ones
                    room.gameState.cards = room.gameState.cards.filter(card => 
                        !setCardIds.includes(card.id)
                    );
                    
                    const newCards = gameLogic.dealCards(3);
                    room.gameState.cards.push(...newCards);
                    
                    io.to(roomCode).emit('set_found', {
                        cardIds: setCardIds,
                        gameState: room.gameState
                    });
                } else {
                    // Invalid set
                    io.to(roomCode).emit('invalid_set', {
                        selectedCards: room.gameState.selectedCards
                    });
                }
            }
        }

        // Broadcast updated game state
        io.to(roomCode).emit('game_state_update', {
            gameState: room.gameState
        });
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        
        // Remove player from all rooms
        for (const [roomCode, room] of rooms) {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const player = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                io.to(roomCode).emit('player_left', {
                    playerId: socket.id,
                    players: room.players
                });
                
                console.log(`Player ${player.name} left room ${roomCode}`);
                break;
            }
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Set Game Server running on port ${PORT}`);
    console.log(`📁 Serving static files from: ${__dirname}`);
    console.log(`🌐 WebSocket server ready for connections`);
});
