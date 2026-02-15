# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**潜行解码 (Cyber Breaker)** is an H5 competitive puzzle game based on the classic "1A2B" (Mastermind) logic game. The game features:
- **Campaign Mode**: 20 structured levels with power-ups and star ratings
- **Tutorial Mode**: Free practice mode with game rules explanation
- **Room PVP**: Real-time 1v1 battles via WebSocket
- **Leaderboard**: Per-level rankings with pagination

## Architecture

This is a monorepo with two main packages:

### Server (`/server`)
- **Tech**: Node.js + TypeScript + Express + WebSocket + MongoDB + Mongoose
- **Purpose**: Handles HTTP APIs, WebSocket room management, and campaign leaderboard
- **Key modules**:
  - `src/routes/`: REST API endpoints (auth, match, leaderboard, room, dev)
  - `src/room/`: WebSocket room management and game logic
    - `store.ts`: In-memory room state management
    - `wsHandler.ts`: WebSocket message handling and game flow
  - `src/models/`: MongoDB schemas (GhostMatchRecord, Player, CampaignScore)
  - `src/services/`: Business logic for matching and scoring

### Web (`/web`)
- **Tech**: Pixi.js 8 + TypeScript + Vite
- **Purpose**: H5 game client optimized for mobile portrait display
- **Key modules**:
  - `src/Game.ts`: Main game controller, scene orchestration
  - `src/scenes/`: Game scenes
    - `HomeScene`: Main menu with mode selection
    - `GuessScene`: Tutorial mode (no time limit)
    - `LevelSelectScene`: Campaign level selection (3-column grid)
    - `CampaignScene`: Campaign gameplay with power-ups
    - `LeaderboardScene`: Rankings with level/page navigation
    - `RoomWaitScene`: Multiplayer lobby
    - `RoomPlayScene`: Real-time PVP gameplay
  - `src/components/`: Reusable UI components
    - `Button`: Standard button with click sound
    - `KeyButton`: 3D keypad button with press animation
    - `BackButton`: Global back button (🚪 icon)
    - `MusicToggle`: Global music toggle (🔊/🔇 icon)
    - `PowerUpButton`: Campaign power-up button
    - `Background`: Animated particle background
  - `src/audio/`: Audio system
    - `bgm.ts`: Background music (Web Audio API)
    - `click.ts`: Click sound effects (synthesized)
  - `src/logic/`: Core game logic (1A2B calculation, power-ups)
  - `src/data/`: Game data (levels, power-ups)
  - `src/services/`: Local storage for progress
  - `src/api/`: HTTP API client

## Development Commands

### Server
```bash
cd server

# Development (watch mode)
pnpm dev

# Build TypeScript
pnpm build

# Production
pnpm start

# Seed ghost match data to MongoDB
pnpm seed
```

### Web
```bash
cd web

# Development server (Vite)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Environment Configuration

Server requires `.env` file (see `server/.env.example`):
```
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/cyberbreaker
JWT_SECRET=your-secret-key
# Optional: Enable dev endpoints
# DEV_SEED_ALLOW=1
```

## Core Game Mechanics

### 1A2B Logic
- Secret code: 4 unique digits (e.g., "4079")
- Guess feedback:
  - **A**: Correct digit in correct position
  - **B**: Correct digit in wrong position
- Win condition: 4A0B
- Implementation: `web/src/logic/guess.ts`

### Campaign Mode
- **20 Levels**: Progressive difficulty (Easy → Normal → Hard → Boss)
- **Power-ups**:
  - 🔍 揭示 (Reveal): Shows one digit position
  - ❌ 排除 (Eliminate): Removes incorrect digits
  - 💡 提示 (Hint): Shows digits in secret
- **Star System**: Earn stars for completion, bonus for perfect clears
- **Constraints**: Time limits and/or guess limits per level
- **Progression**: Unlock levels sequentially, save best scores locally

### WebSocket Room Flow
1. Client creates room via `POST /api/v1/room` → receives `roomId` and `joinUrl`
2. Host connects to `ws://server/ws/room/{roomId}?role=host`
3. Guest joins via `ws://server/ws/room/{roomId}?role=guest`
4. Both players send `set_code` message with their secret code
5. Server broadcasts `game_start` when both codes are set
6. Players alternate sending `guess` messages (15s per turn)
7. Server validates guesses, computes A/B feedback, switches turns
8. Server broadcasts `game_over` when a player achieves 4A0B or time runs out

## UI/UX Design

### Mobile-First Design
- **Target**: Mobile portrait orientation (typical 375-414px width)
- **Keypad Layout**: 3 columns × 4 rows (numbers 1-9, 0 at bottom)
- **Button Sizes**: 64-70px for touch-friendly interaction
- **Font Sizes**: 11-28px range, optimized for readability
- **Compact Layout**: Minimal spacing to maximize screen usage

### Component Guidelines
- **All buttons play click sound by default** (can be disabled with `playSound: false`)
- Button components: `Button`, `KeyButton`, `BackButton`, `MusicToggle`, `PowerUpButton`
- Consistent circular design for global controls (BackButton, MusicToggle)
- 3D depth effect for keypad buttons (KeyButton)
- Hover/press animations for visual feedback

### Audio System
- Background music auto-plays on startup, toggleable via MusicToggle
- Click sounds generated via Web Audio API (no external files)
- All interactive elements trigger audio feedback

## TypeScript Configuration

Both packages use strict TypeScript:
- Server: `module: "NodeNext"` (ES modules with `.js` imports)
- Web: `module: "ESNext"` with Vite bundler, path alias `@/*` → `src/*`

## Code Patterns

### Server
- All route files export a Router instance
- WebSocket messages use JSON with `{ type, ...payload }` structure
- Room state stored in-memory Map (not persisted)
- MongoDB models use Mongoose schemas
- ES module imports must include `.js` extension

### Web
- Pixi.js scenes extend Container
- Game class orchestrates scene transitions
- All components extend Pixi.Container
- Audio played via `playClick()` for clicks, `startBgm()` for music
- Progress saved to localStorage via `ProgressManager`
- Path alias `@/` maps to `src/`
- **Never add manual `playClick()` calls in Button/KeyButton onClick callbacks** - components handle this internally

## Data Persistence

### Client-Side (localStorage)
- `progressManager.ts`: Campaign progress, stars, unlocked levels, power-up inventory
- Key: `cyberbreaker:progress`
- Auto-saves after level completion

### Server-Side (MongoDB)
- `CampaignScore`: Leaderboard entries (levelId, playerName, guessCount, timeMs)
- `GhostMatchRecord`: Ghost match recordings (planned feature)
- `Player`: User accounts (if auth implemented)

## Testing Strategy

No test framework currently configured. When adding tests:
- Server: Consider Jest or Vitest for unit/integration tests
- Web: Consider Vitest + @testing-library for component tests
- E2E: Consider Playwright for full game flow tests

## Deployment Notes

- Server requires MongoDB connection before startup (will log error but continue)
- Web is static build, can be deployed to any CDN/static host
- WebSocket requires proper proxy configuration in production
- Room state is ephemeral (lost on server restart)
- Campaign progress stored client-side only

## Development Guidelines

- **No documentation generation during development** - focus on code implementation
- **Mobile-first UI** - all layouts optimized for portrait phone screens
- **Audio feedback** - ensure all interactions have sound
- **Progressive enhancement** - campaign mode works offline, multiplayer requires server
- **Compact design** - maximize information density for small screens
