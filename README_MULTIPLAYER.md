# Multiplayer Setup Guide

This game now supports multiplayer! Here's how to set it up and run it.

## Architecture

The game uses an **authoritative server** architecture:
- **Server**: Runs all game logic (physics, collisions, damage)
- **Client**: Sends inputs, renders predictions, receives state updates
- **Network**: Socket.io for real-time communication

## Setup

### 1. Install Dependencies

**Client dependencies** (already added):
```bash
npm install
```

**Server dependencies**:
```bash
cd server
npm install
```

### 2. Start the Server

```bash
cd server
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

### 3. Start the Client

In a separate terminal:
```bash
npm run dev
```

## Configuration

### Server URL

The client looks for the server at:
- Environment variable: `VITE_SERVER_URL`
- Default: `http://localhost:3000`

To change it, create a `.env` file:
```
VITE_SERVER_URL=http://localhost:3000
```

Or set it when building:
```bash
VITE_SERVER_URL=http://your-server:3000 npm run build
```

## How It Works

### Current Implementation

1. **Shared Constants** (`src/shared/constants.js`)
   - Game values used by both client and server
   - Ensures consistent behavior

2. **Network Client** (`src/network/client.js`)
   - Handles Socket.io connection
   - Sends player inputs
   - Receives game state updates

3. **Server** (`server/`)
   - `index.js`: Main server entry point
   - `game/gameServer.js`: Game server manager
   - `game/gameRoom.js`: Manages a game session
   - `game/playerEntity.js`: Server-side player entity

4. **Player Management** (`src/network/playerManager.js`)
   - Manages all players (local + remote)
   - Handles interpolation and prediction

### Enabling Multiplayer

Currently, multiplayer is **disabled by default**. To enable it, uncomment this line in `src/scenes/game.js`:

```javascript
// Connect to multiplayer server
networkClient.connect('Player');
```

### Network Flow

1. **Client** collects input (WASD, mouse)
2. **Client** sends input to server
3. **Server** validates and processes input
4. **Server** updates game state
5. **Server** broadcasts state to all clients (20 updates/sec)
6. **Client** receives state and interpolates
7. **Client** renders all players

## Next Steps

### To Fully Enable Multiplayer:

1. **Uncomment network connection** in `game.js`
2. **Add player visual representations** for remote players
3. **Sync projectiles** between server and client
4. **Implement collision** on server (currently basic)
5. **Add weapon sync** between players

### Features to Add:

- [ ] Player models/avatars for other players
- [ ] Server-side collision detection
- [ ] Weapon synchronization
- [ ] Projectile synchronization
- [ ] Room/matchmaking system
- [ ] Lag compensation
- [ ] Client-side prediction refinement
- [ ] Anti-cheat validation

## Development

### Testing Multiplayer

1. Start server: `cd server && npm start`
2. Open two browser windows
3. Enable multiplayer in both
4. Move around - you should see both players

### Debugging

- Server logs: Check terminal running server
- Client logs: Check browser console
- Network: Use browser DevTools ? Network ? WS tab

## Architecture Files

```
src/
  shared/
    constants.js          # Shared game constants
  network/
    client.js             # Network client
    playerManager.js      # Player management
  entities/
    playerEntity.js       # Client player representation
    
server/
  index.js                # Server entry point
  game/
    gameServer.js         # Game server manager
    gameRoom.js           # Game room/session
    playerEntity.js       # Server player entity
    projectileEntity.js   # Server projectile entity
```

## Performance

- **Server tick rate**: 30 ticks/sec
- **Network updates**: 20 updates/sec
- **Client FPS**: 60 FPS (rendering)
- **Interpolation**: Smooth between network updates

## Security Notes

?? **For Production:**
- Add authentication
- Validate all inputs on server
- Rate limit client requests
- Use HTTPS/WSS
- Add CORS restrictions
- Implement anti-cheat measures