# Set Game Backend

Backend server for the multiplayer Set game, built with Node.js, Express, Socket.io, and PostgreSQL.

## Features

- Real-time multiplayer gameplay using WebSockets
- Room-based game sessions with friendly room codes
- Persistent game state and history
- Player management and scoring
- Set validation and tracking

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 12+

### Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your database credentials
```

3. Set up the database:
```bash
# Create a PostgreSQL database
createdb setgame

# Run migrations
npm run migrate
```

4. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### Rooms
- `GET /api/rooms/:roomCode` - Get room information
- `POST /api/rooms` - Create a new room
- `GET /api/rooms/:roomCode/players` - Get players in a room
- `GET /api/rooms/:roomCode/history` - Get game history for a room

## WebSocket Events

### Client → Server
- `join_room` - Join a room with player name
- `select_card` - Select/deselect a card
- `disconnect` - Handle disconnection

### Server → Client
- `room_joined` - Confirmation of joining a room
- `player_joined` - Another player joined
- `player_left` - A player left
- `game_state_update` - Game state changed
- `error` - Error occurred

## Database Schema

The database includes tables for:
- `rooms` - Game rooms with state
- `players` - Player information and scores
- `games` - Game sessions
- `sets` - Sets found by players

## Deployment

This backend is designed to be deployed on Render. See `render.yaml` for configuration.

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `MAX_PLAYERS_PER_ROOM` - Maximum players per room (default: 12)
- `ROOM_CLEANUP_HOURS` - Hours before cleaning inactive rooms (default: 24)





