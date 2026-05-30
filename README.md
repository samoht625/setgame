# Set Game — Multiplayer & Solo

A real-time implementation of the classic Set card game built with Rails, ActionCable and React.
Play together on a shared board at `/`, or play a timed solo game at `/s` — you can switch
between the two modes from the toggle in the header at any time.

## Game Rules

The game consists of 81 unique cards with four features:
- **Number**: 1, 2, or 3 shapes
- **Color**: red, purple, or green
- **Shape**: squiggle, diamond, or oval
- **Shading**: solid, striped, or open

A valid set consists of three cards where, for each feature, the three cards are either:
- All the same, OR
- All different

Select three cards to claim a set. The board automatically grows to 15 or 18 cards when no
set is present, and the round ends when the deck is exhausted and no sets remain.

## Modes

- **Multiplayer** (`/`): one shared, server-authoritative board for everyone connected.
  Scores, presence and recent sets update live over WebSockets. When the deck runs out the
  round ends, placements are shown, and a new round starts automatically.
- **Solo** (`/s`): a private timed game that runs entirely in your browser. Progress, the
  timer and your best times are persisted in `localStorage`, so you can leave and resume.

## Features

- Real-time multiplayer gameplay using ActionCable WebSockets
- Solo mode with timer, pause/resume and local best times
- Clean, board-first UI that works on phones, tablets and desktops
- Automatic game progression (extra deals, reshuffles, new rounds)
- Editable display names with sensible defaults, presence and idle indicators

## Local Development

### Prerequisites

- Ruby 3.2 (see `.ruby-version`)
- Node.js and Yarn

There is no database; all game state is held in memory by a single server process.

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

3. Start the server (or use `bin/dev` for watchers + livereload):
```bash
bin/rails server
```

4. Open http://localhost:3000 (multiplayer) or http://localhost:3000/s (solo)

### Testing

- `ruby script/test_rules.rb` — sanity checks for the card mapping and set validation logic
- `yarn typecheck` — TypeScript type checking
- Open multiple browser tabs to test multiplayer locally

## Deployment

See `DEPLOYMENT.md`. The app is currently deployed behind a reverse proxy via the systemd
unit in `deploy/` (see `scripts/install-setgame-service.sh`); a `render.yaml` is also
included for Render deployments. Because game state is in-memory and ActionCable uses the
async adapter, run a single process (state is lost on restart).

## Architecture

- **Backend**: Rails 8 with ActionCable for WebSockets (no database)
- **Frontend**: React + TypeScript bundled with esbuild
- **Styling**: Tailwind CSS 4
- **Game Engine**: In-memory singleton service managing the multiplayer game state
- **Rules Engine**: Set validation logic shared conceptually between Ruby and TypeScript

## File Structure

```
app/
  channels/
    application_cable/
      connection.rb      # Player identification (UUID via query param/cookie)
    game_channel.rb      # WebSocket channel for the multiplayer game
  controllers/
    home_controller.rb   # Multiplayer (/) and solo (/s) pages
  javascript/
    components/
      App.tsx            # Shell: header + mode switching (multiplayer/solo)
      Header.tsx         # Wordmark + mode toggle
      GameLayout.tsx     # Shared board-centered layout
      MultiplayerGame.tsx# Multiplayer state + ActionCable wiring
      Board.tsx          # Card grid
      Scoreboard.tsx     # Players, deck, results, recent sets
      Toast.tsx          # Feedback messages
    solitaire/
      SolitaireGame.tsx  # Solo game state, timer and persistence
      SolitaireSidebar.tsx
    lib/rules.ts         # Set validation (client)
    cable.ts             # ActionCable consumer
    application.js       # Entry point
  services/
    game_engine.rb       # Multiplayer game state management
    rules.rb             # Set validation (server)
  views/
    home/                # index (multiplayer) and solitaire views
config/
  initializers/
    game_engine.rb       # Initialize global game engine
public/
  cards/                 # Card images (1.png through 81.png), see CARD_MAPPING.md
script/
  test_rules.rb          # Rules sanity checks
```

## How It Works (Multiplayer)

1. **Connection**: each browser gets a persistent player UUID (localStorage + signed cookie)
2. **Game State**: single authoritative game state in the `GAME_ENGINE` service
3. **Set Claims**: players select 3 cards; the claim is sent over the WebSocket
4. **Validation**: the server validates the cards are distinct, on the board, and form a set
5. **Scoring**: each valid claim scores 1 point; scores reset when a new round starts
6. **Auto-progression**: the server deals replacements, extends the board when no set exists,
   and starts a new round shortly after the deck is exhausted

## License

Copyright Anysphere Inc.
