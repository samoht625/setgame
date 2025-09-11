# Set Game Deployment Guide

This guide explains how to deploy the Set Card Game to Render.

## Project Structure

- **Frontend**: Static HTML/CSS/JavaScript files served from the root directory
- **Backend**: Node.js server in the `backend/` directory
- **Database**: PostgreSQL database for persistent storage

## Deployment Steps

### 1. Connect Repository to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" and select "Blueprint"
3. Connect your GitHub repository
4. Render will automatically detect the `render.yaml` configuration

### 2. Services Created

The `render.yaml` configuration creates:

- **Backend Service** (`setgame-backend`): Node.js API server
- **Frontend Service** (`setgame-frontend`): Static site hosting
- **Database** (`setgame-db`): PostgreSQL database

### 3. Environment Variables

The backend service automatically gets:
- `NODE_ENV=production`
- `DATABASE_URL` (from the database service)
- `PORT=10000`

### 4. URLs

After deployment, you'll get:
- Backend: `https://setgame-backend.onrender.com`
- Frontend: `https://setgame-frontend.onrender.com`

## Local Development

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
npm install
npm run serve
```

## Features

- Real-time multiplayer gameplay using WebSockets
- Room-based game sessions with friendly room codes
- Persistent game state and history
- Player management and scoring
- Set validation and tracking

## Troubleshooting

### CORS Issues
The backend is configured to allow requests from the frontend domain in production.

### Database Connection
The backend uses the `DATABASE_URL` environment variable provided by Render.

### Static File Serving
The backend serves static files as a fallback, but the frontend service handles the main static hosting.

## Notes

- The backend uses the minimal server (`server-minimal.js`) for deployment
- Room data is stored in memory (not persistent across restarts)
- For production, consider using the full server (`server.js`) with database persistence
