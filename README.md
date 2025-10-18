# Set Game - Realtime Multiplayer

A real-time multiplayer implementation of the classic Set card game using Rails and ActionCable.

## Game Rules

The game consists of 81 unique cards with four features:
- **Number**: 1, 2, or 3 shapes
- **Shape**: diamond, squiggle, or oval
- **Shading**: solid, striped, or open
- **Color**: red, green, or purple

A valid set consists of three cards where, for each feature, the three cards are either:
- All the same, OR
- All different

## Features

- Real-time multiplayer gameplay using ActionCable WebSockets
- Automatic game progression (no manual controls needed)
- Ephemeral player management (automatic assignment on connect)
- Score tracking per connection
- Automatic round restart when deck is exhausted

## Local Development

### Prerequisites

- Ruby 3.2.2 (managed via rbenv)
- Node.js and Yarn
- PostgreSQL (for production, SQLite for development)

### Setup

1. Install dependencies:
```bash
bundle install
yarn install
```

2. Build assets:
```bash
yarn build
yarn build:css
```

3. Start the server:
```bash
bin/rails server
```

4. Open http://localhost:3000 in your browser

### Testing Multiplayer Locally

Open multiple browser tabs or windows to http://localhost:3000 to test multiplayer functionality.

## Deployment to Render

### Prerequisites

1. Create a Render account at https://render.com
2. Connect your GitHub repository

### Deployment Steps

1. Push your code to GitHub:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. Create a new Web Service on Render:
   - Connect your GitHub repository
   - Use the `render.yaml` configuration file
   - Render will automatically detect the configuration

3. Configure Environment Variables:
   - `RAILS_ENV`: `production`
   - `RAILS_LOG_TO_STDOUT`: `enabled`
   - `RAILS_MASTER_KEY`: Copy from `config/master.key` (keep this secret!)

4. Update ActionCable Allowed Origins:
   After deployment, update `config/environments/production.rb`:
   ```ruby
   config.action_cable.allowed_request_origins = [
     "https://your-app-name.onrender.com"
   ]
   ```

5. Deploy!

### Render Configuration

The `render.yaml` file is configured for:
- Single web service (no Redis needed for single instance)
- Automatic builds on git push
- Production Rails environment
- ActionCable WebSocket support

## Architecture

- **Backend**: Rails 8 with ActionCable for WebSockets
- **Frontend**: React + TypeScript bundled with esbuild
- **Styling**: Tailwind CSS
- **Game Engine**: In-memory singleton service managing game state
- **Rules Engine**: Set validation logic

## File Structure

```
app/
  channels/
    application_cable/
      connection.rb      # Player identification
    game_channel.rb      # WebSocket channel for game
  controllers/
    home_controller.rb   # Root route controller
  javascript/
    components/          # React components
      App.tsx           # Main app component
      Board.tsx          # Card board display
      Scoreboard.tsx     # Player scores
    application.js       # Entry point
    cable.ts             # ActionCable consumer
  services/
    game_engine.rb       # Game state management
    rules.rb             # Set validation logic
  views/
    home/
      index.html.erb     # Root view
config/
  initializers/
    game_engine.rb       # Initialize global game engine
public/
  cards/                 # Card images (1.png through 81.png)
```

## How It Works

1. **Connection**: Each browser connection gets a unique ephemeral player ID
2. **Game State**: Single authoritative game state in `GAME_ENGINE` service
3. **Set Claims**: Players select 3 cards and submit claims via WebSocket
4. **Validation**: Server验证s if cards form a valid set
5. **Scoring**: First valid claim gets 1 point
6. **Auto-progression**: Game automatically deals new cards and starts new rounds

## License

Copyright Anysphere Inc.
