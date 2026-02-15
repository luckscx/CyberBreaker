# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**潜行解码 (Cyber Breaker)** is an H5 competitive puzzle game based on the classic "1A2B" (Mastermind) logic game. The game features an innovative **Asynchronous Ghost Matchmaking System** that allows players to compete against recorded gameplay from real players, solving the cold-start problem for multiplayer H5 games.

## Architecture

This is a monorepo with two main packages:

### Server (`/server`)
- **Tech**: Node.js + TypeScript + Express + WebSocket + MongoDB + Mongoose
- **Purpose**: Handles HTTP APIs, WebSocket room management, and ghost match data persistence
- **Key modules**:
  - `src/routes/`: REST API endpoints (auth, match, leaderboard, room, dev)
  - `src/room/`: WebSocket room management and game logic
    - `store.ts`: In-memory room state management
    - `wsHandler.ts`: WebSocket message handling and game flow
  - `src/models/`: MongoDB schemas (GhostMatchRecord, Player)
  - `src/services/`: Business logic for matching and ghost replay

### Web (`/web`)
- **Tech**: Pixi.js 8 + TypeScript + Vite
- **Purpose**: H5 game client with 2D rendering
- **Key modules**:
  - `src/Game.ts`: Main game controller, scene orchestration
  - `src/scenes/`: Game scenes (HomeScene, GuessScene, RoomWaitScene, RoomPlayScene)
  - `src/room/client.ts`: WebSocket client for room communication
  - `src/logic/`: Core game logic (1A2B calculation)
  - `src/components/`: Reusable UI components (Button, etc.)
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
- Implementation: `server/src/room/store.ts:computeAB()`

### WebSocket Room Flow
1. Client creates room via `POST /api/v1/room` → receives `roomId` and `joinUrl`
2. Host connects to `ws://server/ws/room/{roomId}?role=host`
3. Guest joins via `ws://server/ws/room/{roomId}?role=guest`
4. Both players send `set_code` message with their secret code
5. Server broadcasts `game_start` when both codes are set
6. Players alternate sending `guess` messages
7. Server validates guesses, computes A/B feedback, switches turns
8. Server broadcasts `game_over` when a player achieves 4A0B

### Ghost Matchmaking (Planned)
The system stores `GhostMatchRecord` documents containing:
- Player's complete action timeline with timestamps
- MMR snapshot for skill-based matching
- Target code and total completion time
- Used skills (tactical abilities)

Frontend replays opponent actions from the timeline using timers to simulate real-time PVP pressure.

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
- RoomClient handles WebSocket lifecycle and message parsing
- All async operations use Promise-based API
- Path alias `@/` maps to `src/`

## Testing Strategy

No test framework currently configured. When adding tests:
- Server: Consider Jest or Vitest for unit/integration tests
- Web: Consider Vitest + @testing-library for component tests
- E2E: Consider Playwright for full game flow tests

## Database Schema

### GhostMatchRecord
```typescript
{
  recordId: string (unique)
  playerId: string (indexed)
  targetCode: string
  totalTimeMs: number
  mmrSnapshot: number (indexed)
  actionTimeline: [{
    timestamp: number  // ms since game start
    guessCode: string
    result: string     // e.g., "1A2B"
    usedSkill?: string
  }]
}
```

## Deployment Notes

- Server requires MongoDB connection before startup (will log error but continue)
- Web is static build, can be deployed to any CDN/static host
- WebSocket requires proper proxy configuration in production (no `noServer: true` issues)
- Room state is ephemeral (lost on server restart)
