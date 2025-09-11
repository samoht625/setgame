import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:8000', 'http://127.0.0.1:8000'],
        methods: ['GET', 'POST']
    }
});

const PORT = 3001; // Different port to avoid conflicts

// Middleware
app.use(cors());
app.use(express.json());

// Store rooms in memory
const rooms = new Map();

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/rooms', (req, res) => {
    const roomCode = `room-${Math.random().toString(36).substr(2, 6)}`;
    rooms.set(roomCode, {
        roomCode,
        players: [],
        gameState: {
            cards: [],
            selectedCards: [],
            gamePhase: 'waiting'
        }
    });
    
    console.log(`Created room: ${roomCode}`);
    res.json({
        roomCode: roomCode,
        message: 'Room created successfully'
    });
});

app.get('/api/rooms/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    const room = rooms.get(roomCode);
    
    if (!room) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    res.json({
        room: {
            id: roomCode,
            roomCode: roomCode,
            createdAt: new Date().toISOString(),
            gameState: room.gameState,
            isActive: true
        },
        players: room.players,
        currentGame: null
    });
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join_room', async (data) => {
        try {
            const { roomCode, playerName } = data;
            
            // Find or create room
            let room = rooms.get(roomCode);
            if (!room) {
                room = {
                    roomCode,
                    players: [],
                    gameState: {
                        cards: [],
                        selectedCards: [],
                        gamePhase: 'waiting'
                    }
                };
                rooms.set(roomCode, room);
            }
            
            // Create player
            const player = {
                playerId: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: playerName,
                isOnline: true,
                currentScore: 0,
                setsFound: 0
            };
            
            room.players.push(player);
            
            // Join socket room
            socket.join(roomCode);
            socket.playerId = player.playerId;
            socket.roomCode = roomCode;
            
            // Send room joined confirmation
            socket.emit('room_joined', {
                roomCode,
                playerId: player.playerId,
                players: room.players,
                gameState: room.gameState
            });
            
            // Notify other players
            socket.to(roomCode).emit('player_joined', {
                player: player
            });
            
            console.log(`Player ${playerName} joined room ${roomCode}`);
            
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });
    
    socket.on('select_card', async (data) => {
        try {
            const { cardId } = data;
            const roomCode = socket.roomCode;
            
            if (!roomCode) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            
            const room = rooms.get(roomCode);
            if (!room) {
                socket.emit('error', { message: 'Room not found' });
                return;
            }
            
            // Simple card selection logic
            if (!room.gameState.selectedCards.includes(cardId)) {
                room.gameState.selectedCards.push(cardId);
            } else {
                room.gameState.selectedCards = room.gameState.selectedCards.filter(id => id !== cardId);
            }
            
            // Check if we have 3 selected cards
            if (room.gameState.selectedCards.length === 3) {
                // Clear selection
                room.gameState.selectedCards = [];
            }
            
            // Broadcast to all players in room
            io.to(roomCode).emit('game_state_update', {
                gameState: room.gameState,
                selectedBy: socket.playerId
            });
            
        } catch (error) {
            console.error('Error selecting card:', error);
            socket.emit('error', { message: 'Failed to select card' });
        }
    });
    
    socket.on('disconnect', async () => {
        try {
            const playerId = socket.playerId;
            const roomCode = socket.roomCode;
            
            if (playerId && roomCode) {
                const room = rooms.get(roomCode);
                if (room) {
                    // Remove player
                    room.players = room.players.filter(p => p.playerId !== playerId);
                    
                    // Notify other players
                    socket.to(roomCode).emit('player_left', {
                        playerId
                    });
                    
                    console.log(`Player ${playerId} left room ${roomCode}`);
                }
            }
            
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Local backend server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

export default app;


