import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './database/connection.js';
import { Room } from './models/Room.js';
import { Player } from './models/Player.js';
import { Game } from './models/Game.js';
import { Set } from './models/Set.js';

dotenv.config();

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

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store active connections
const activeConnections = new Map(); // playerId -> socketId
const roomConnections = new Map(); // roomId -> Set of playerIds

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/rooms/:roomCode', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findByCode(roomCode);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const players = await Player.findByRoom(room.id);
        const currentGame = await Game.getCurrentGame(room.id);
        
        res.json({
            room: {
                id: room.id,
                roomCode: room.room_code,
                createdAt: room.created_at,
                gameState: room.game_state,
                isActive: room.is_active
            },
            players: players.map(p => ({
                playerId: p.player_id,
                name: p.name,
                joinedAt: p.joined_at,
                isOnline: p.is_online,
                currentScore: p.current_score,
                setsFound: p.sets_found
            })),
            currentGame
        });
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/rooms', async (req, res) => {
    // Temporary: create room without database
    const roomCode = `room-${Math.random().toString(36).substr(2, 6)}`;
    res.json({
        roomCode: roomCode,
        message: 'Room created successfully'
    });
});

app.get('/api/rooms/:roomCode/players', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findByCode(roomCode);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const players = await Player.findByRoom(room.id);
        res.json(players.map(p => ({
            playerId: p.player_id,
            name: p.name,
            joinedAt: p.joined_at,
            isOnline: p.is_online,
            currentScore: p.current_score,
            setsFound: p.sets_found
        })));
    } catch (error) {
        console.error('Error fetching players:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/rooms/:roomCode/history', async (req, res) => {
    try {
        const { roomCode } = req.params;
        const room = await Room.findByCode(roomCode);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const history = await Game.getGameHistory(room.id);
        res.json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join_room', async (data) => {
        try {
            const { roomCode, playerName } = data;
            
            // Find or create room
            let room = await Room.findByCode(roomCode);
            if (!room) {
                room = await Room.create();
            }
            
            // Check if room is full
            const playerCount = await Player.getPlayerCount(room.id);
            if (playerCount >= (process.env.MAX_PLAYERS_PER_ROOM || 12)) {
                socket.emit('error', { message: 'Room is full' });
                return;
            }
            
            // Create player
            const player = await Player.create(room.id, playerName);
            
            // Store connection
            activeConnections.set(player.player_id, socket.id);
            if (!roomConnections.has(room.id)) {
                roomConnections.set(room.id, new Set());
            }
            roomConnections.get(room.id).add(player.player_id);
            
            // Join socket room
            socket.join(roomCode);
            socket.playerId = player.player_id;
            socket.roomId = room.id;
            socket.roomCode = roomCode;
            
            // Get current players and game state
            const players = await Player.findByRoom(room.id);
            const gameState = await Room.getGameState(room.id);
            
            // Send room joined confirmation
            socket.emit('room_joined', {
                roomCode,
                playerId: player.player_id,
                players: players.map(p => ({
                    playerId: p.player_id,
                    name: p.name,
                    isOnline: p.is_online,
                    currentScore: p.current_score,
                    setsFound: p.sets_found
                })),
                gameState
            });
            
            // Notify other players
            socket.to(roomCode).emit('player_joined', {
                player: {
                    playerId: player.player_id,
                    name: player.name,
                    isOnline: true,
                    currentScore: 0,
                    setsFound: 0
                }
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
            const roomId = socket.roomId;
            const playerId = socket.playerId;
            
            if (!roomId || !playerId) {
                socket.emit('error', { message: 'Not in a room' });
                return;
            }
            
            // Get current game state
            const gameState = await Room.getGameState(roomId);
            if (!gameState) {
                socket.emit('error', { message: 'Game state not found' });
                return;
            }
            
            // Add card to selected cards if not already selected
            if (!gameState.selectedCards.includes(cardId)) {
                gameState.selectedCards.push(cardId);
            } else {
                // Remove card if already selected
                gameState.selectedCards = gameState.selectedCards.filter(id => id !== cardId);
            }
            
            // Check if we have 3 selected cards
            if (gameState.selectedCards.length === 3) {
                // TODO: Implement set validation logic
                // For now, just clear selection
                gameState.selectedCards = [];
            }
            
            // Update game state
            await Room.updateGameState(roomId, gameState);
            
            // Broadcast to all players in room
            io.to(socket.roomCode).emit('game_state_update', {
                gameState,
                selectedBy: playerId
            });
            
        } catch (error) {
            console.error('Error selecting card:', error);
            socket.emit('error', { message: 'Failed to select card' });
        }
    });
    
    socket.on('disconnect', async () => {
        try {
            const playerId = socket.playerId;
            const roomId = socket.roomId;
            
            if (playerId && roomId) {
                // Update player status
                await Player.setOnlineStatus(playerId, false);
                
                // Remove from room connections
                if (roomConnections.has(roomId)) {
                    roomConnections.get(roomId).delete(playerId);
                }
                
                // Notify other players
                socket.to(socket.roomCode).emit('player_left', {
                    playerId
                });
                
                console.log(`Player ${playerId} left room ${socket.roomCode}`);
            }
            
            // Clean up connections
            activeConnections.delete(playerId);
            
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// Cleanup inactive rooms every hour
setInterval(async () => {
    try {
        const cleaned = await Room.cleanupInactiveRooms();
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} inactive rooms`);
        }
    } catch (error) {
        console.error('Error cleaning up rooms:', error);
    }
}, 60 * 60 * 1000); // 1 hour

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;

