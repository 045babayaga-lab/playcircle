# PlayCircle — multiplayer family games starter

A responsive React + Vite homepage for a family-friendly multiplayer party-games platform.

## What's included
- Responsive homepage with PlayCircle branding
- Game discovery cards for Imposter, Family Quiz, Draw & Guess, Word Battle, Memory Match and Tic-Tac-Toe
- Create-room dialog with game selection, nickname and demo room-code generation
- Join-room dialog with room-code input and basic validation
- Mobile navigation and responsive layouts

## Run locally
1. Install Node.js (18+ recommended).
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the local URL printed by Vite (usually `http://localhost:5173`).

## Important: current demo boundary
The create-room interaction generates a demo code in the browser. The join-room interaction validates the code format and shows a demo message. There is not yet a real multiplayer server, room persistence, authentication, or live gameplay. Those require the next backend stage.

## Suggested next architecture
- Frontend: React + Vite (this project)
- Backend: Node.js + Express
- Realtime: Socket.IO
- Database: MongoDB
- Server-authoritative game state: room membership, player readiness, secret roles/words, turns, timers and scores

Suggested future structure:
```text
playcircle/
  src/
    components/       # Header, GameCard, Modal, RoomCode
    pages/            # Home, Lobby, Game
    games/            # Imposter, Quiz, Draw & Guess, etc.
    hooks/            # Socket and room hooks
    services/         # API and socket client
    styles/           # Global and component styles
  server/
    src/
      routes/         # HTTP endpoints
      sockets/        # Socket.IO room events
      games/          # Server-side game rules
      models/         # MongoDB models
```

## Before public launch
Add server-side room-code validation, rate limits, nickname/content moderation, private-room controls, reconnect handling, and tests for each game's rules. Do not put secret game roles or answers in frontend code; send private information only to the intended player from the server.
