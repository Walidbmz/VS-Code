// Socket.io Connection
// Update this URL to your Render server URL (e.g., https://domino-game-server-xyz.onrender.com)
const SOCKET_SERVER_URL = 'http://localhost:3000'; // Replace with your Render URL
const socket = io(SOCKET_SERVER_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
});

// Game State
let gameState = {
    playerName: '',
    lobbyId: '',
    playerId: -1,
    players: [],
    chain: [],
    currentPlayerIdx: 0,
    round: 0,
    teams: [],
    gameOver: false,
    roundActive: false,
    myHand: [],
    roundEnded: false
};

// Pending tile placement
let pendingTileIdx = null;

// Toast Notification System
function showToast(message, type = 'info') {
    console.log('Toast called:', message, type);
    const toastContainer = document.getElementById('toastContainer');
    console.log('Toast container element:', toastContainer);
    
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-message">${message}</span>`;
    console.log('Toast element created:', toast);
    
    toastContainer.appendChild(toast);
    console.log('Toast appended to container');
    
    // Auto-remove after animation completes (4 seconds)
    setTimeout(() => {
        toast.remove();
    }, 4000);
    
    // Allow click to dismiss
    toast.addEventListener('click', () => {
        toast.remove();
    });
}

// Utility Functions
function renderPips(number) {
    // Pip positions in a 3x3 grid (0-2 rows and cols)
    const pipPositions = {
        0: [],
        1: [[1, 1]],                                           // Center
        2: [[0, 0], [2, 2]],                                  // Diagonal corners
        3: [[0, 0], [1, 1], [2, 2]],                          // Diagonal line
        4: [[0, 0], [0, 2], [2, 0], [2, 2]],                 // Four corners
        5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],         // X pattern with center
        6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]]  // Two columns of three
    };

    const positions = pipPositions[number] || [];
    let html = '';
    
    // Create 3x3 grid
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const hasPip = positions.some(p => p[0] === i && p[1] === j);
            if (hasPip) {
                html += '<div><div class="domino-pip"></div></div>';
            } else {
                html += '<div></div>';  // Empty placeholder to maintain grid
            }
        }
    }
    return html;
}

function createDominoElement(tile) {
    const isDouble = tile.left === tile.right;
    const orientation = isDouble ? 'horizontal' : 'vertical';
    return `<div class="domino" data-left="${tile.left}" data-right="${tile.right}" data-orientation="${orientation}">
                <div class="domino-top">${renderPips(tile.left)}</div>
                <div class="domino-bottom">${renderPips(tile.right)}</div>
            </div>`;
}

// Join Game
function joinGame() {
    const playerName = document.getElementById('playerName').value.trim();

    if (!playerName) {
        alert('Please enter your name');
        return;
    }

    gameState.playerName = playerName;

    socket.emit('joinLobby', {
        playerName: playerName
    });

    document.getElementById('joinScreen').classList.remove('active');
    document.getElementById('lobbyScreen').classList.add('active');
}

// Socket Events
socket.on('lobbyCreated', (data) => {
    gameState.lobbyId = data.lobbyId;
    gameState.playerId = 0;
    updateLobbyPlayers(data.players);
});

socket.on('playerJoined', (data) => {
    gameState.playerId = data.players.findIndex(p => p.name === gameState.playerName);
    updateLobbyPlayers(data.players);
});

socket.on('lobbyFull', (data) => {
    alert(data.message);
});

socket.on('gameState', (state) => {
    updateGameState(state);
});

socket.on('playerLeft', (data) => {
    updateLobbyPlayers(data.players);
});

socket.on('playerPassed', (data) => {
    console.log('playerPassed event received:', data);
    showToast(`${data.playerName} passed`, 'player-pass');
});

socket.on('gameBlocked', (data) => {
    console.log('gameBlocked event received:', data);
    showToast('Game Mega or GG', 'game-over');
});

socket.on('roundEnded', (data) => {
    console.log('roundEnded event received:', data);
    gameState.roundEnded = true;
    
    // Show round-end modal with countdown
    showRoundEnd(data);
});

// Update Lobby Players
function updateLobbyPlayers(players) {
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';

    for (let i = 0; i < 4; i++) {
        const player = players[i];
        const div = document.createElement('div');
        div.className = 'player-slot' + (player ? ' filled' : '');
        div.textContent = player ? `✓ ${player.name}` : 'Waiting...';
        playersList.appendChild(div);
    }

    const waitingText = document.getElementById('waitingText');
    if (players.length === 1) {
        waitingText.textContent = 'Waiting for 3 more players...';
    } else if (players.length === 2) {
        waitingText.textContent = 'Waiting for 2 more players...';
    } else if (players.length === 3) {
        waitingText.textContent = 'Waiting for 1 more player...';
    } else if (players.length === 4) {
        waitingText.textContent = 'Game starting...';
    }
}

// Update Game State
function updateGameState(state) {
    gameState.players = state.players;
    gameState.chain = state.chain;
    gameState.currentPlayerIdx = state.currentPlayerIdx;
    gameState.round = state.round;
    gameState.teams = state.teams;
    gameState.gameOver = state.gameOver;
    gameState.roundActive = state.roundActive;

    // Find my player ID by matching my name in the players array (sent from server)
    // This ensures we match the server's player ID assignment
    gameState.playerId = state.players.findIndex(p => p.name === gameState.playerName);
    
    // Get my hand
    if (gameState.playerId >= 0 && gameState.playerId < 4) {
        gameState.myHand = state.players[gameState.playerId].hand || [];
    }

    // Hide waiting screens and show game once gameplay state is received
    document.getElementById('joinScreen')?.classList.remove('active');
    document.getElementById('lobbyScreen')?.classList.remove('active');
    document.getElementById('gameScreen')?.classList.add('active');

    updateUI();

    // Check for game over
    if (state.gameOver) {
        showGameOver();
    }
}

// Update UI
function updateUI() {
    updateScores();
    updateRound();
    updatePlayers();
    updateChain();
    updateCurrentPlayer();
    updateHand();
}

// Update Scores
function updateScores() {
    document.getElementById('team1Score').textContent = gameState.teams[0]?.score || 0;
    document.getElementById('team2Score').textContent = gameState.teams[1]?.score || 0;
}

// Update Round
function updateRound() {
    document.getElementById('roundNumber').textContent = gameState.round;
}

// Update Players
function updatePlayers() {
    if (gameState.players.length >= 4 && gameState.playerId >= 0) {
        // Arrange players in a circle relative to the human player
        // Human player is at bottom (position 0)
        // Positions: left = (playerId - 1 + 4) % 4, right = (playerId + 1) % 4, top = (playerId + 2) % 4
        const leftIdx = (gameState.playerId - 1 + 4) % 4;
        const rightIdx = (gameState.playerId + 1) % 4;
        const topIdx = (gameState.playerId + 2) % 4;
        
        // Left player
        const leftPlayer = gameState.players[leftIdx];
        const leftTeamClass = leftPlayer.teamId === 0 ? 'team1' : 'team2';
        document.getElementById('playerLeft').innerHTML = 
            `<div class="player-name ${leftTeamClass}">${leftPlayer.name}</div><div class="tile-count">${leftPlayer.handSize} tiles</div>`;

        // Right player
        const rightPlayer = gameState.players[rightIdx];
        const rightTeamClass = rightPlayer.teamId === 0 ? 'team1' : 'team2';
        document.getElementById('playerRight').innerHTML = 
            `<div class="player-name ${rightTeamClass}">${rightPlayer.name}</div><div class="tile-count">${rightPlayer.handSize} tiles</div>`;

        // Top player (opponent directly across from you)
        const topPlayer = gameState.players[topIdx];
        const topTeamClass = topPlayer.teamId === 0 ? 'team1' : 'team2';
        document.getElementById('playerTop').innerHTML = 
            `<div class="player-name ${topTeamClass}">${topPlayer.name}</div><div class="tile-count">${topPlayer.handSize} tiles</div>`;

        // Bottom player (human player)
        const bottomPlayer = gameState.players[gameState.playerId];
        const bottomTeamClass = bottomPlayer.teamId === 0 ? 'team1' : 'team2';
        document.getElementById('playerBottom').innerHTML = 
            `<div class="player-name ${bottomTeamClass}">${bottomPlayer.name} (You)</div><div class="tile-count">${gameState.myHand.length} tiles</div>`;
    }
}

// Update Chain
function updateChain() {
    const chainDisplay = document.getElementById('chainDisplay');
    
    if (gameState.chain.length === 0) {
        chainDisplay.innerHTML = '<div class="empty-chain">Waiting for first move...</div>';
        document.getElementById('chainEnds').innerHTML = '';
    } else {
        const chainHtml = gameState.chain.map(tile => {
            const isDouble = tile.left === tile.right;
            const orientation = isDouble ? 'horizontal' : 'vertical';

            return `<div class="domino" data-left="${tile.left}" data-right="${tile.right}" data-orientation="${orientation}">
                        <div class="domino-top">${renderPips(tile.left)}</div>
                        <div class="domino-bottom">${renderPips(tile.right)}</div>
                    </div>`;
        }).join('');

        chainDisplay.innerHTML = chainHtml;

        // Keep the [6|6] tile centered in the board viewport whenever present.
        const doubleSixTile = chainDisplay.querySelector('.domino[data-left="6"][data-right="6"]');
        if (doubleSixTile) {
            requestAnimationFrame(() => {
                const targetLeft = doubleSixTile.offsetLeft - ((chainDisplay.clientWidth - doubleSixTile.clientWidth) / 2);
                const targetTop = doubleSixTile.offsetTop - ((chainDisplay.clientHeight - doubleSixTile.clientHeight) / 2);

                chainDisplay.scrollLeft = Math.max(0, targetLeft);
                chainDisplay.scrollTop = Math.max(0, targetTop);
            });
        }

        const leftEnd = gameState.chain[0].left;
        const rightEnd = gameState.chain[gameState.chain.length - 1].right;
        document.getElementById('chainEnds').innerHTML = `<strong>Open Ends: ${leftEnd} | ${rightEnd}</strong>`;
    }
}

// Update Current Player
function updateCurrentPlayer() {
    const currentPlayer = gameState.players[gameState.currentPlayerIdx];
    if (currentPlayer) {
        const color = currentPlayer.teamId === 0 ? 'team1' : 'team2';
        document.querySelector('.player-turn').innerHTML = 
            `<div class="turn-name">${currentPlayer.name}'s Turn</div>`;
    }
}

// Update Hand
function updateHand() {
    const handContainer = document.getElementById('handContainer');

    if (gameState.myHand.length === 0) {
        handContainer.innerHTML = '<div class="hand-empty">No tiles</div>';
        document.getElementById('passBtn').disabled = true;
        return;
    }

    // Check which tiles are valid
    let validTileIndices = [];
    if (gameState.roundActive && gameState.currentPlayerIdx === gameState.playerId) {
        // If chain is empty (first move), only [6|6] is valid
        if (gameState.chain.length === 0) {
            validTileIndices = gameState.myHand
                .map((tile, idx) => (tile.left === 6 && tile.right === 6) ? idx : -1)
                .filter(idx => idx !== -1);
        } else {
            // Chain has tiles, must match an end
            const leftEnd = gameState.chain[0].left;
            const rightEnd = gameState.chain[gameState.chain.length - 1].right;

            validTileIndices = gameState.myHand
                .map((tile, idx) => (tile.left === leftEnd || tile.right === leftEnd || tile.left === rightEnd || tile.right === rightEnd) ? idx : -1)
                .filter(idx => idx !== -1);
        }
    }

    let handHtml = gameState.myHand.map((tile, idx) => {
        const isValid = validTileIndices.includes(idx);
        const className = `hand-tile ${isValid ? 'selectable' : ''}`;
        
        return `<div class="${className}" onclick="selectTile(${idx})">${createDominoElement(tile)}</div>`;
    }).join('');

    handContainer.innerHTML = handHtml;

    // Enable/disable pass button
    const isMyTurn = gameState.currentPlayerIdx === gameState.playerId;
    const canPlay = validTileIndices.length > 0;
    document.getElementById('passBtn').disabled = !isMyTurn || !gameState.roundActive;
}

// Select Tile
function selectTile(idx) {
    if (gameState.currentPlayerIdx !== gameState.playerId) {
        alert('Not your turn!');
        return;
    }

    if (!gameState.roundActive) {
        return;
    }

    const tile = gameState.myHand[idx];

    // If chain is empty (first move), only [6|6] can be played
    if (gameState.chain.length === 0) {
        if (tile.left === 6 && tile.right === 6) {
            socket.emit('playTile', { tileIdx: idx, end: 'right' });
        } else {
            alert('Opening move must be the double six.');
        }
        return;
    }

    // Chain has tiles, must match an end
    const leftEnd = gameState.chain[0].left;
    const rightEnd = gameState.chain[gameState.chain.length - 1].right;

    const canPlayLeft = tile.left === leftEnd || tile.right === leftEnd;
    const canPlayRight = tile.left === rightEnd || tile.right === rightEnd;

    if (!canPlayLeft && !canPlayRight) {
        alert('Cannot play this tile!');
        return;
    }

    if (canPlayLeft && canPlayRight) {
        // Show custom modal for tile placement
        pendingTileIdx = idx;
        document.getElementById('tilePlacementModal').classList.add('active');
    } else {
        const end = canPlayRight ? 'right' : 'left';
        socket.emit('playTile', { tileIdx: idx, end: end });
    }
}

// Pass Turn
function passTurn() {
    if (gameState.currentPlayerIdx !== gameState.playerId) {
        alert('Not your turn!');
        return;
    }

    socket.emit('passTurn', {});
}

// Show Game Over
function showGameOver() {
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('gameOverScreen').classList.add('active');

    const winnerTeamIdx = gameState.teams[0].score >= 100 ? 0 : 1;
    const winnerTeam = gameState.teams[winnerTeamIdx];
    const teamColor = winnerTeamIdx === 0 ? 'team1' : 'team2';
    const totalRounds = gameState.round || 1;

    let resultHtml = `
        <div class="game-over-banner ${teamColor}">
            <div class="banner-emoji">🏆</div>
            <div class="banner-title">Team ${winnerTeamIdx + 1} Claims the Match</div>
            <div class="banner-subtitle">${winnerTeam.players.join(' & ')}</div>
        </div>
        <div class="game-over-scoreline">
            <div class="score-pill team1">Team 1: ${gameState.teams[0].score}</div>
            <div class="score-pill team2">Team 2: ${gameState.teams[1].score}</div>
        </div>
        <div class="game-over-meta">
            <div class="meta-item">Rounds Played: ${totalRounds}</div>
            <div class="meta-item">Winning Score: ${winnerTeam.score}</div>
        </div>
    `;

    document.getElementById('gameOverResult').innerHTML = resultHtml;
}

// Show Round End Screen with Countdown
function showRoundEnd(data) {
    const roundEndScreen = document.getElementById('roundEndScreen');
    roundEndScreen.classList.add('active');

    // Clear the visible board/hand while the next round is shuffling
    gameState.chain = [];
    gameState.myHand = [];
    updateChain();
    updateHand();
    const currentPlayerEl = document.querySelector('.player-turn');
    if (currentPlayerEl) {
        currentPlayerEl.innerHTML = '<div class="turn-name">Shuffling...</div>';
    }
    
    const winnerTeamIdx = data.winnerTeamIdx;
    const teamNames = ['Team 1', 'Team 2'];
    const teamEmojis = ['🟢', '🟠'];
    
    // Congratulations message
    const winnerTitle = document.getElementById('roundEndTitle');
    winnerTitle.textContent = `🎯 ${teamEmojis[winnerTeamIdx]} ${teamNames[winnerTeamIdx]} Wins This Round! 🎯`;
    
    // Winner details
    const winnerText = document.getElementById('roundEndWinner');
    winnerText.innerHTML = `
        <p style="font-size: 1.1em; color: #3ecf8e; margin-bottom: 10px;">
            ${data.winnerTeamPlayers.join(' & ')} 🏆
        </p>
        <p style="color: var(--text); font-size: 0.95em;">
            earned <strong>${data.pointsEarned}</strong> points!
        </p>
    `;
    
    // Score display
    const scoresDisplay = document.getElementById('roundScores');
    scoresDisplay.innerHTML = `
        <div class="team-score">🟢 Team 1: <strong>${data.team1Score}</strong></div>
        <div class="team-score">🟠 Team 2: <strong>${data.team2Score}</strong></div>
    `;
    
    // Start countdown
    let countdownValue = 10;
    const countdownEl = document.getElementById('countdown');
    countdownEl.textContent = countdownValue;
    
    const countdownInterval = setInterval(() => {
        countdownValue--;
        countdownEl.textContent = countdownValue;
        
        if (countdownValue <= 0) {
            clearInterval(countdownInterval);
            roundEndScreen.classList.remove('active');
        }
    }, 1000);
}

// Handle Tile Placement Choice
function handleTilePlacement(end) {
    // Hide modal
    document.getElementById('tilePlacementModal').classList.remove('active');
    
    // Emit the tile placement with the chosen end
    if (pendingTileIdx !== null) {
        socket.emit('playTile', { tileIdx: pendingTileIdx, end: end });
        pendingTileIdx = null;
    }
}

// Reset Game
function resetGame() {
    location.reload();
}

window.addEventListener('resize', () => {
    if (document.getElementById('gameScreen').classList.contains('active')) {
        updateChain();
    }
});
