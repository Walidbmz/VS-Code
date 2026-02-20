const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game Lobby Management
const lobbies = {};
const gameRooms = {};

// Utilities
function generateLobbyId() {
    return Math.random().toString(36).substring(2, 10);
}

// Socket.io Connection
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Join or create lobby
    socket.on('joinLobby', (data) => {
        const { playerName } = data;
        console.log(`\n[joinLobby] ${playerName} attempting to join`);
        console.log(`[joinLobby] Total lobbies: ${Object.keys(lobbies).length}`);
        
        // Show all lobbies
        for (let lobbyId in lobbies) {
            console.log(`[joinLobby]   Lobby ${lobbyId}: ${lobbies[lobbyId].players.length}/4 players`);
        }
        
        // Find any existing lobby that isn't full
        let lobby = null;
        let foundLobbyId = null;
        for (let lobbyId in lobbies) {
            if (lobbies[lobbyId].players.length < 4) {
                lobby = lobbies[lobbyId];
                foundLobbyId = lobbyId;
                break;
            }
        }
        
        // If no available lobby, create a new one
        if (!lobby) {
            const newLobbyId = generateLobbyId();
            console.log(`[joinLobby] CREATING new lobby: ${newLobbyId}`);
            lobbies[newLobbyId] = {
                id: newLobbyId,
                players: [{
                    id: 0,
                    name: playerName,
                    socketId: socket.id
                }],
                gameState: null
            };
            
            socket.join(newLobbyId);
            socket.lobbyId = newLobbyId;
            socket.playerId = 0;
            
            console.log(`[joinLobby] "${playerName}" created lobby ${newLobbyId}`);
            
            socket.emit('lobbyCreated', {
                lobbyId: newLobbyId,
                players: lobbies[newLobbyId].players
            });
        } else {
            // Join existing lobby
            const playerId = lobby.players.length;
            const lobbyId = lobby.id;
            
            lobby.players.push({
                id: playerId,
                name: playerName,
                socketId: socket.id
            });
            
            socket.join(lobbyId);
            socket.lobbyId = lobbyId;
            socket.playerId = playerId;
            
            console.log(`[joinLobby] "${playerName}" JOINED lobby ${lobbyId} (player ${playerId})`);
            console.log(`[joinLobby] Lobby ${lobbyId}: ${lobby.players.length}/4 players`);
            console.log(`[joinLobby] Players: ${lobby.players.map(p => p.name).join(', ')}`);
            
            io.to(lobbyId).emit('playerJoined', {
                players: lobby.players,
                lobbyId: lobbyId
            });
            
            if (lobby.players.length === 4) {
                console.log(`[joinLobby] Lobby ${lobbyId} FULL! Starting game...`);
                setTimeout(() => {
                    startGame(lobbyId);
                }, 1500);
            }
        }
    });

    // Player makes a move
    socket.on('playTile', (data) => {
        const lobbyId = socket.lobbyId;
        const gameRoom = gameRooms[lobbyId];

        if (!gameRoom) return;

        const { tileIdx, end } = data;
        gameRoom.playTile(socket.playerId, tileIdx, end);
        
        broadcastGameState(lobbyId, gameRoom);
    });

    // Player passes
    socket.on('passTurn', () => {
        const lobbyId = socket.lobbyId;
        const gameRoom = gameRooms[lobbyId];

        if (!gameRoom) return;

        const playerName = gameRoom.players[socket.playerId].name;
        const passesBeforeBlock = gameRoom.consecutivePasses;
        
        console.log(`[passTurn] ${playerName} passes (consecutive: ${passesBeforeBlock})`);
        
        gameRoom.passTurn(socket.playerId);
        
        // Emit pass event to notify all players
        console.log(`[passTurn] Emitting playerPassed for ${playerName}`);
        io.to(lobbyId).emit('playerPassed', { playerName: playerName });
        
        // Check if game just blocked (4 consecutive passes)
        if (passesBeforeBlock < 4 && gameRoom.consecutivePasses >= 4) {
            console.log(`[passTurn] Game blocked! (passes: ${gameRoom.consecutivePasses})`);
            io.to(lobbyId).emit('gameBlocked', {});
        }
        
        broadcastGameState(lobbyId, gameRoom);
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        if (socket.lobbyId) {
            const lobby = lobbies[socket.lobbyId];
            if (lobby) {
                lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
                
                if (lobby.players.length === 0) {
                    delete lobbies[socket.lobbyId];
                    delete gameRooms[socket.lobbyId];
                } else {
                    io.to(socket.lobbyId).emit('playerLeft', {
                        players: lobby.players
                    });
                }
            }
        }
    });
});

// Game Room Class
class GameRoom {
    constructor(lobbyId, players) {
        this.lobbyId = lobbyId;
        this.players = players.map((p, idx) => ({
            id: p.id,
            name: p.name,
            socketId: p.socketId,  // Preserve socketId from lobby
            hand: [],
            teamId: idx % 2  // 0 and 2 = team 0, 1 and 3 = team 1
        }));

        this.chain = [];
        this.deck = [];
        this.currentPlayerIdx = 0;
        this.round = 0;
        this.consecutivePasses = 0;
        this.gameOver = false;
        this.roundActive = true;

        this.teams = [
            { id: 0, score: 0, players: [this.players[0], this.players[2]] },
            { id: 1, score: 0, players: [this.players[1], this.players[3]] }
        ];

        this.winningScore = 100;
        this.lastRoundWinner = null;  // Track who won the last round

        this.startRound();
    }

    createDeck() {
        const deck = [];
        // Create standard Double-Six domino set (28 unique tiles)
        // 0-Suit: 0-0, 0-1, 0-2, 0-3, 0-4, 0-5, 0-6 (7 tiles)
        // 1-Suit: 1-1, 1-2, 1-3, 1-4, 1-5, 1-6 (6 tiles)
        // 2-Suit: 2-2, 2-3, 2-4, 2-5, 2-6 (5 tiles)
        // 3-Suit: 3-3, 3-4, 3-5, 3-6 (4 tiles)
        // 4-Suit: 4-4, 4-5, 4-6 (3 tiles)
        // 5-Suit: 5-5, 5-6 (2 tiles)
        // 6-Suit: 6-6 (1 tile)
        // Total: 28 unique tiles
        
        for (let i = 0; i <= 6; i++) {
            for (let j = i; j <= 6; j++) {
                deck.push({ left: i, right: j });
            }
        }
        
        // Verify deck has exactly 28 tiles
        if (deck.length !== 28) {
            console.error(`ERROR: Deck has ${deck.length} tiles instead of 28!`);
        }
        
        // Proper Fisher-Yates shuffle (not biased like sort)
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        
        return deck;
    }

    startRound() {
        this.round++;
        this.chain = [];
        this.consecutivePasses = 0;
        this.roundActive = true;

        this.players.forEach(p => p.hand = []);
        this.deck = this.createDeck();

        // Deal 7 tiles to each player (4 × 7 = 28 tiles = entire deck)
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 7; j++) {
                const tile = this.deck.pop();
                this.players[i].hand.push(tile);
            }
        }

        // Verify deck is empty
        if (this.deck.length !== 0) {
            console.error(`ERROR: Deck still has ${this.deck.length} tiles after dealing!`);
        }

        // Find starting player (who has [6|6] or highest double) - they get to play first
        this.findStartingPlayer();
        // Don't automatically place the tile - let the player choose to play it
    }

    findStartingPlayer() {
        // Starting player must hold [6|6]
        for (let i = 0; i < 4; i++) {
            if (this.players[i].hand.some(t => t.left === 6 && t.right === 6)) {
                this.currentPlayerIdx = i;
                return;
            }
        }

        // Fallback safety (should never happen in a full double-six set)
        console.warn('[findStartingPlayer] No double six found. Defaulting to player 0.');
        this.currentPlayerIdx = 0;
    }

    playFirstTile() {
        const player = this.players[this.currentPlayerIdx];
        
        let tile = player.hand[0];
        
        // Find [6|6]
        for (let t of player.hand) {
            if (t.left === 6 && t.right === 6) {
                tile = t;
                break;
            }
        }

        // Find highest double
        if (tile.left !== 6 || tile.right !== 6) {
            for (let t of player.hand) {
                if (t.left === t.right) {
                    tile = t;
                    break;
                }
            }
        }

        player.hand = player.hand.filter(t => t !== tile);
        this.chain.push(tile);
        this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 4;
    }

    playTile(playerIdx, tileIdx, end) {
        if (playerIdx !== this.currentPlayerIdx) return;

        const player = this.players[playerIdx];
        if (tileIdx < 0 || tileIdx >= player.hand.length) return;

        const tile = player.hand[tileIdx];
        let validPlay = false;

        // If chain is empty (first move of round), only [6|6] can be played
        if (this.chain.length === 0) {
            if (tile.left === 6 && tile.right === 6) {
                this.chain.push(tile);
                validPlay = true;
            }
        } else {
            // Chain has tiles, must match an end
            const leftEnd = this.chain[0].left;
            const rightEnd = this.chain[this.chain.length - 1].right;

            if (end === 'right' && (tile.left === rightEnd || tile.right === rightEnd)) {
                if (tile.left !== rightEnd) {
                    [tile.left, tile.right] = [tile.right, tile.left];
                }
                this.chain.push(tile);
                validPlay = true;
            } else if (end === 'left' && (tile.left === leftEnd || tile.right === leftEnd)) {
                if (tile.right !== leftEnd) {
                    [tile.left, tile.right] = [tile.right, tile.left];
                }
                this.chain.unshift(tile);
                validPlay = true;
            }
        }

        if (validPlay) {
            player.hand.splice(tileIdx, 1);
            this.consecutivePasses = 0;

            // Check if player won
            if (player.hand.length === 0) {
                this.endRound(playerIdx);
                return;
            }

            this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 4;
        }
    }

    passTurn(playerIdx) {
        if (playerIdx !== this.currentPlayerIdx) return;

        this.consecutivePasses++;

        if (this.consecutivePasses >= 4) {
            this.blockGame();
            return;
        }

        this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 4;
    }

    endRound(winnerPlayerIdx) {
        const winnerTeam = this.teams[this.players[winnerPlayerIdx].teamId];
        const loserTeam = this.teams[1 - this.players[winnerPlayerIdx].teamId];
        
        const loserPips = loserTeam.players.reduce((sum, p) => sum + p.hand.reduce((s, t) => s + (t.left + t.right), 0), 0);
        
        winnerTeam.score += loserPips;
        this.roundActive = false;
        this.lastRoundWinner = winnerPlayerIdx;

        // Check if game over
        if (winnerTeam.score >= this.winningScore) {
            this.gameOver = true;
        } else {
            // Emit round ended event
            const winnerTeamIdx = this.players[winnerPlayerIdx].teamId;
            const winnerTeamPlayers = this.teams[winnerTeamIdx].players.map(p => p.name);
            
            console.log(`[endRound] Round ended! ${winnerTeamPlayers.join(' & ')} (Team ${winnerTeamIdx + 1}) won!`);
            
            // Send to all players
            Object.values(this.players).forEach(player => {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.emit('roundEnded', {
                        winnerTeamIdx: winnerTeamIdx,
                        winnerTeamPlayers: winnerTeamPlayers,
                        pointsEarned: loserPips,
                        team1Score: this.teams[0].score,
                        team2Score: this.teams[1].score
                    });
                }
            });
            
            // Auto-start next round after 10 seconds
            setTimeout(() => {
                this.startRound();
                broadcastGameState(this.lobbyId, this);
            }, 10000);
        }
    }

    blockGame() {
        const team0Pips = this.teams[0].players.reduce((sum, p) => sum + p.hand.reduce((s, t) => s + (t.left + t.right), 0), 0);
        const team1Pips = this.teams[1].players.reduce((sum, p) => sum + p.hand.reduce((s, t) => s + (t.left + t.right), 0), 0);

        let winnerTeamIdx = null;
        let pointsEarned = 0;
        
        if (team0Pips < team1Pips) {
            winnerTeamIdx = 0;
            pointsEarned = team1Pips - team0Pips;
            this.teams[0].score += pointsEarned;
        } else if (team1Pips < team0Pips) {
            winnerTeamIdx = 1;
            pointsEarned = team0Pips - team1Pips;
            this.teams[1].score += pointsEarned;
        } else {
            // Tie - no winner, no points
            winnerTeamIdx = null;
        }

        this.roundActive = false;

        if (this.teams[0].score >= this.winningScore || this.teams[1].score >= this.winningScore) {
            this.gameOver = true;
        } else {
            // Emit round ended event for block game
            const winnerTeamPlayers = winnerTeamIdx !== null ? this.teams[winnerTeamIdx].players.map(p => p.name) : ['No one'];
            
            console.log(`[blockGame] Game blocked! ${winnerTeamPlayers.join(' & ')} (Team ${winnerTeamIdx !== null ? winnerTeamIdx + 1 : '?'}) wins!`);
            
            // Send to all players
            Object.values(this.players).forEach(player => {
                const playerSocket = io.sockets.sockets.get(player.socketId);
                if (playerSocket) {
                    playerSocket.emit('roundEnded', {
                        winnerTeamIdx: winnerTeamIdx !== null ? winnerTeamIdx : 0,
                        winnerTeamPlayers: winnerTeamPlayers,
                        pointsEarned: pointsEarned,
                        team1Score: this.teams[0].score,
                        team2Score: this.teams[1].score
                    });
                }
            });
            
            // Auto-start next round after 10 seconds
            setTimeout(() => {
                this.startRound();
                broadcastGameState(this.lobbyId, this);
            }, 10000);
        }
    }

    getState(playerId) {
        return {
            chain: this.chain,
            players: this.players.map((p, idx) => ({
                id: p.id,
                name: p.name,
                handSize: p.hand.length,
                // Only send the current player's hand to them
                hand: idx === playerId ? p.hand : [],
                teamId: p.teamId
            })),
            currentPlayerIdx: this.currentPlayerIdx,
            teams: this.teams.map(t => ({
                id: t.id,
                score: t.score,
                players: t.players.map(p => p.name)
            })),
            round: this.round,
            gameOver: this.gameOver,
            roundActive: this.roundActive
        };
    }
}

// Start Game
function startGame(lobbyId) {
    const lobby = lobbies[lobbyId];
    const playerNames = lobby.players.map(p => p.name);
    
    console.log(`[startGame] Starting game in lobby ${lobbyId} with players: ${playerNames.join(', ')}`);
    
    // Pass complete player data including socketId
    const gameRoom = new GameRoom(lobbyId, lobby.players);
    gameRooms[lobbyId] = gameRoom;

    // Broadcast game state first
    broadcastGameState(lobbyId, gameRoom);
    
    // Then remove lobby from available lobbies so new players start a fresh lobby
    delete lobbies[lobbyId];
    console.log(`[startGame] Lobby ${lobbyId} removed from available lobbies`);
}

// Broadcast Game State to all players with their own hands
function broadcastGameState(lobbyId, gameRoom) {
    // Get players from gameRoom
    gameRoom.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
            const state = gameRoom.getState(player.id);
            playerSocket.emit('gameState', state);
        }
    });
}

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
