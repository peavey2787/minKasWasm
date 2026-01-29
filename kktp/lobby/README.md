# KKTP Lobby Module

Multi-party group sessions built on top of the 1:1 KKTP protocol.

## Overview

The Lobby module enables group communication with:
- **Host-managed lobbies** with discovery anchors
- **Encrypted group messaging** using XChaCha20-Poly1305
- **Automatic key rotation** every 10 minutes
- **Member management** (join, leave, kick)
- **State root commitments** for integrity verification

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      LOBBY PROTOCOL                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Host broadcasts Discovery Anchor with lobby=true        │
│     ↓                                                       │
│  2. Peer sees lobby, opens 1:1 DM with host                │
│     ↓                                                       │
│  3. Peer sends join request via encrypted DM                │
│     ↓                                                       │
│  4. Host accepts → sends GroupKey_v1 via DM                 │
│     ↓                                                       │
│  5. All members encrypt group messages with GroupKey        │
│     ↓                                                       │
│  6. Key rotates every 10 minutes (host distributes via DMs) │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `lobbyManager.js` | Main lobby lifecycle management class |
| `lobbyMessageHandler.js` | Routes incoming messages to handlers |
| `lobbyCodec.js` | XChaCha20-Poly1305 encryption for group messages |
| `lobbySchemas.js` | Validation functions for all lobby messages |
| `index.js` | Module exports |

## Usage

### Hosting a Lobby

```javascript
import { LobbyManager } from './kktp/lobby/index.js';

const lobbyManager = new LobbyManager(kaspaPortal.sessionManager);

// Set up event handlers
lobbyManager.onMemberJoin((member) => {
  console.log(`${member.displayName} joined!`);
});

lobbyManager.onGroupMessage((msg) => {
  console.log(`${msg.senderName}: ${msg.plaintext}`);
});

// Host a lobby
const { lobbyId, discovery } = await lobbyManager.hostLobby({
  lobbyName: "My Game Lobby",
  gameName: "Chess",
  maxMembers: 8,
  uptimeSeconds: 3600,
});
```

### Joining a Lobby

```javascript
// Find a lobby in discovered peers
const lobbyDiscovery = discoveredPeers.find(p => p.meta?.lobby);

// Join it
await lobbyManager.joinLobby(lobbyDiscovery, "PlayerName");
```

### Sending Group Messages

```javascript
// Send to all members
await lobbyManager.sendGroupMessage("Hello everyone!");
```

### Managing Members (Host Only)

```javascript
// Kick a member
await lobbyManager.kickMember(memberPubSig, "Reason");

// Rotate key manually
await lobbyManager.rotateKey("Security refresh");

// Close lobby
await lobbyManager.closeLobby("Game ended");
```

## Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `lobby_join_request` | Peer → Host | Request to join lobby |
| `lobby_join_response` | Host → Peer | Accept/reject with group key |
| `lobby_member_event` | Host → All | Member joined/left notification |
| `key_rotation` | Host → All | New group key distribution |
| `lobby_leave` | Peer → Host | Voluntary leave notification |
| `lobby_kicked` | Host → Peer | Kick notification |
| `lobby_close` | Host → All | Lobby shutdown |
| `group_message` | Any → Group | Encrypted group message |

## Security

### Encryption
- **Group Messages**: XChaCha20-Poly1305 with 24-byte random nonce
- **AAD**: `groupMailboxId || keyVersion` (domain separation)
- **Key Size**: 32 bytes (256-bit)

### Key Rotation
- Automatic every 10 minutes
- Manual rotation on member kick (forward secrecy)
- State root commitment for roster integrity

### Trust Model
- Host is trusted for key distribution
- All DM channels use KKTP's existing encryption
- Members cannot impersonate each other (signed messages)

## Discovery Schema Extension

The lobby extends the KKTP discovery anchor with:

```json
{
  "meta": {
    "game": "string",
    "version": "string", 
    "expected_uptime_seconds": 3600,
    "lobby": true,
    "lobby_name": "My Lobby",
    "max_members": 16
  }
}
```

## States

| State | Description |
|-------|-------------|
| `IDLE` | Not in any lobby |
| `HOSTING` | Hosting a lobby as host |
| `JOINING` | Sent join request, waiting for response |
| `MEMBER` | Active lobby member |
| `CLOSED` | Lobby was closed |

## Events

```javascript
lobbyManager.onMemberJoin((member) => { });
lobbyManager.onMemberLeave((pubSig, reason) => { });
lobbyManager.onGroupMessage((msg) => { });
lobbyManager.onKeyRotation((version) => { });
lobbyManager.onLobbyClose((reason) => { });
lobbyManager.onStateChange((newState, oldState) => { });
```

## Configuration

```javascript
const lobbyManager = new LobbyManager(sessionManager, {
  maxMembers: 16,          // Default max members
  keyRotationMs: 600000,   // 10 minutes
});
```

## Integration with Dashboard

The KKTP Dashboard includes full lobby support:

1. Check "Host as Lobby" checkbox
2. Enter a lobby name
3. Click "Host Lobby"
4. Other peers will see your lobby in the peer list
5. They can click "Join" to request access
6. As host, you can kick members or close the lobby

## License

See main project LICENSE.
