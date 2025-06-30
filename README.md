# Set Card Game - Web Version

A TypeScript web implementation of the classic Set card game. Find sets of three cards where each feature (number, shape, shading, color) is either all the same or all different across the three cards.

## Features

- 🎮 **Interactive Web Game** - Play directly in your browser
- ⏱️ **Timer & Scoring** - Track your time and sets found
- 💾 **High Scores** - Local storage of best times
- ⏸️ **Pause/Resume** - Pause the game anytime
- 💡 **Hints** - Get hints when stuck
- 📱 **Responsive Design** - Works on desktop and mobile
- 🎨 **Modern UI** - Clean, intuitive interface

## How to Play

1. **Goal**: Find sets of three cards
2. **Valid Set**: Each feature (number, shape, shading, color) must be either:
   - All the same across the three cards, OR
   - All different across the three cards
3. **Controls**: Click cards to select them (max 3)
4. **Auto-check**: When you select 3 cards, the game automatically checks if it's a valid set

## Running the Game

### Option 1: Direct Play
1. Open `index.html` in your web browser
2. Start playing immediately!

### Option 2: Local Server (Recommended)
1. Install dependencies: `npm install -g typescript`
2. Compile TypeScript: `npm run build` (or just `tsc`)
3. Start server: `npm run serve` (or `python3 -m http.server 8000`)
4. Open `http://localhost:8000` in your browser

## Development

### Prerequisites
- Node.js and npm
- TypeScript (`npm install -g typescript`)

### Building from Source
```bash
# Compile TypeScript
npm run build
# or
tsc

# Watch for changes during development
npm run watch
# or
tsc --watch
```

### Project Structure
```
├── card.ts          # Card class and enums
├── gameLogic.ts     # Game logic and rules
├── game.ts          # UI and game interface
├── main.ts          # Application entry point
├── index.html       # Main HTML page
├── style.css        # Game styling
├── cards/           # Card images (PNG files)
└── README.md        # This file
```

## Game Rules

### Valid Set Examples
- **All Same**: 3 red solid ovals
- **All Different**: 1 red solid diamond, 2 green striped ovals, 3 purple open squiggles

### Invalid Set Examples
- **Mixed**: 1 red solid diamond, 1 red solid oval, 1 green solid diamond
  - ❌ Color is red, red, green (not all same, not all different)

## Technologies Used

- **TypeScript** - Type-safe JavaScript
- **HTML5** - Modern web markup
- **CSS3** - Responsive styling with Flexbox/Grid
- **ES6 Modules** - Modern JavaScript modules
- **LocalStorage** - Client-side high score persistence

## License

MIT License - Feel free to use and modify! 