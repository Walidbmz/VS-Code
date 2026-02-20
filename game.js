// Game State
let gameState = {
    players: [],
    teams: [],
    currentRound: 0,
    currentPlayerIdx: 0,
    chain: [],
    deck: [],
    gameOver: false,
    roundActive: false,
    selectedTile: null,
    winningScore: 100,
    consecutivePasses: 0
};

// Domino Class
class Domino {
    constructor(left, right) {
        this.left = left;
        this.right = right;
    }

    isDouble() {
        return this.left === this.right;
    }

    hasValue(value) {
        return this.left === value || this.right === value;
    }

    pipCount() {
        return this.left + this.right;
    }

    toString() {
        return `[${this.left}|${this.right}]`;
    }

    display() {
        return `<div class="domino" data-left="${this.left}" data-right="${this.right}">
                    <div class="domino-top">${this.left}</div>
                    <div class="domino-bottom">${this.right}</div>
                </div>`;
    }
}

// Player Class
class Player {
    constructor(id, name, teamId) {
        this.id = id;
        this.name = name;
        this.teamId = teamId;
        this.hand = [];
    }

    drawTile(tile) {
        this.hand.push(tile);
    }

    playTile(tile) {
        const idx = this.hand.indexOf(tile);
        if (idx > -1) {
            this.hand.splice(idx, 1);
        }
    }

    getValidTiles(leftEnd, rightEnd) {
        return this.hand.filter(tile => 
            tile.hasValue(leftEnd) || tile.hasValue(rightEnd)
        );
    }

    totalPips() {
        return this.hand.reduce((sum, tile) => sum + tile.pipCount(), 0);
    }
}

// Team Class
class Team {
    constructor(id, player1, player2) {
        this.id = id;
        this.players = [player1, player2];
        this.score = 0;
    }

    addScore(points) {
        this.score += points;
    }

    getTeamPips() {
        return this.players.reduce((sum, player) => sum + player.totalPips(), 0);
    }
}

// Initialize Game
function startGame() {
    const names = [
        document.getElementById('player1').value || 'Player 1',
        document.getElementById('player2').value || 'Player 2',
        document.getElementById('player3').value || 'Player 3',
        document.getElementById('player4').value || 'Player 4'
    ];

    const winningScore = parseInt(document.getElementById('winningScore').value) || 100;

    gameState.winningScore = winningScore;
    gameState.players = [
        new Player(0, names[0], 0),
        new Player(1, names[1], 1),
        new Player(2, names[2], 0),
        new Player(3, names[3], 1)
    ];

    gameState.teams = [
        new Team(0, gameState.players[0], gameState.players[2]),
        new Team(1, gameState.players[1], gameState.players[3])
    ];

    document.getElementById('setupScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');

    startRound();
}

// Create Deck
function createDeck() {
    const deck = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            deck.push(new Domino(i, j));
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

// Start Round
function startRound() {
    gameState.currentRound++;
    document.getElementById('roundNumber').textContent = gameState.currentRound;

    // Reset state
    gameState.players.forEach(p => p.hand = []);
    gameState.chain = [];
    gameState.consecutivePasses = 0;
    gameState.selectedTile = null;

    // Create and shuffle deck
    gameState.deck = createDeck();

    // Deal 7 tiles to each player
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 7; j++) {
            gameState.players[i].drawTile(gameState.deck.pop());
        }
    }

    gameState.roundActive = true;
    findStartingPlayer();
    updateUI();
}

// Find Starting Player
function findStartingPlayer() {
    // Look for [6|6]
    for (let i = 0; i < 4; i++) {
        for (let tile of gameState.players[i].hand) {
            if (tile.left === 6 && tile.right === 6) {
                gameState.currentPlayerIdx = i;
                playFirstTile();
                return;
            }
        }
    }

    // Look for highest double
    let highestDouble = null;
    let highestIdx = 0;
    for (let i = 0; i < 4; i++) {
        for (let tile of gameState.players[i].hand) {
            if (tile.isDouble()) {
                if (!highestDouble || tile.left > highestDouble.left) {
                    highestDouble = tile;
                    highestIdx = i;
                }
            }
        }
    }

    gameState.currentPlayerIdx = highestIdx;
    playFirstTile();
}

// Play First Tile
function playFirstTile() {
    const player = gameState.players[gameState.currentPlayerIdx];
    let tileToPlay = player.hand[0];

    // Find [6|6] if available
    for (let tile of player.hand) {
        if (tile.left === 6 && tile.right === 6) {
            tileToPlay = tile;
            break;
        }
    }

    // Find highest double if [6|6] not available
    if (tileToPlay.left !== 6 || tileToPlay.right !== 6) {
        for (let tile of player.hand) {
            if (tile.isDouble()) {
                tileToPlay = tile;
                break;
            }
        }
    }

    player.playTile(tileToPlay);
    gameState.chain.push(tileToPlay);
    gameState.currentPlayerIdx = (gameState.currentPlayerIdx + 1) % 4;
    updateUI();
}

// Update UI
function updateUI() {
    updateScores();
    updatePlayers();
    updateChain();
    updateCurrentPlayer();
    updateHand();
}

// Update Scores
function updateScores() {
    document.getElementById('team1Score').textContent = gameState.teams[0].score;
    document.getElementById('team2Score').textContent = gameState.teams[1].score;
}

// Update Players Info
function updatePlayers() {
    // Left player (Player 0)
    const leftPlayer = gameState.players[0];
    const leftHtml = `<div class="player-name">${leftPlayer.name}</div><div class="tile-count">${leftPlayer.hand.length} tiles</div>`;
    document.getElementById('playerLeft').innerHTML = leftHtml;

    // Right player (Player 3)
    const rightPlayer = gameState.players[3];
    const rightHtml = `<div class="player-name">${rightPlayer.name}</div><div class="tile-count">${rightPlayer.hand.length} tiles</div>`;
    document.getElementById('playerRight').innerHTML = rightHtml;

    // Bottom player (Player 1)
    const bottomPlayer = gameState.players[1];
    const bottomHtml = `<div class="player-name">${bottomPlayer.name}</div><div class="tile-count">${bottomPlayer.hand.length} tiles</div>`;
    document.getElementById('playerBottom').innerHTML = bottomHtml;
}

// Update Chain Display
function updateChain() {
    const chainDisplay = document.getElementById('chainDisplay');
    
    if (gameState.chain.length === 0) {
        chainDisplay.innerHTML = '<div class="empty-chain">No tiles played yet</div>';
        document.getElementById('chainEnds').innerHTML = '';
    } else {
        const chainHtml = gameState.chain.map(tile => tile.display()).join('');
        chainDisplay.innerHTML = chainHtml;

        const leftEnd = gameState.chain[0].left;
        const rightEnd = gameState.chain[gameState.chain.length - 1].right;
        document.getElementById('chainEnds').innerHTML = `<strong>Open Ends: ${leftEnd} | ${rightEnd}</strong>`;
    }
}

// Update Current Player
function updateCurrentPlayer() {
    const currentPlayer = gameState.players[gameState.currentPlayerIdx];
    const currentPlayerDiv = document.querySelector('.player-turn');
    
    const color = currentPlayer.teamId === 0 ? 'team1' : 'team2';
    currentPlayerDiv.innerHTML = `<div class="turn-name">${currentPlayer.name}'s Turn</div>`;
}

// Update Hand
function updateHand() {
    const handContainer = document.getElementById('handContainer');
    const player = gameState.players[1]; // Bottom player (human player)

    if (player.hand.length === 0) {
        handContainer.innerHTML = '<div class="hand-empty">No tiles</div>';
        return;
    }

    const leftEnd = gameState.chain.length > 0 ? gameState.chain[0].left : null;
    const rightEnd = gameState.chain.length > 0 ? gameState.chain[gameState.chain.length - 1].right : null;
    const validTiles = player.getValidTiles(leftEnd, rightEnd);

    let handHtml = player.hand.map((tile, idx) => {
        const isValid = gameState.roundActive && validTiles.includes(tile);
        const isSelected = gameState.selectedTile === tile;
        const className = `hand-tile ${isValid ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`;
        
        return `<div class="${className}" onclick="selectTile(${idx})">${tile.display()}</div>`;
    }).join('');

    handHtml += `<div class="total-pips">Total: ${player.totalPips()}</div>`;
    handContainer.innerHTML = handHtml;
}

// Select Tile
function selectTile(idx) {
    const player = gameState.players[1];
    const tile = player.hand[idx];

    if (gameState.currentPlayerIdx !== 1) {
        alert('Not your turn!');
        return;
    }

    const leftEnd = gameState.chain[0].left;
    const rightEnd = gameState.chain[gameState.chain.length - 1].right;
    const validTiles = player.getValidTiles(leftEnd, rightEnd);

    if (!validTiles.includes(tile)) {
        alert('Cannot play this tile!');
        return;
    }

    // Check if tile can play on both ends
    const canPlayLeft = tile.hasValue(leftEnd);
    const canPlayRight = tile.hasValue(rightEnd);

    if (canPlayLeft && canPlayRight) {
        gameState.selectedTile = tile;
        updateHand();
        
        const choice = confirm(`Tile can play on both ends!\n\nOK = Play on RIGHT end\nCancel = Play on LEFT end`);
        playTile(tile, choice ? 'right' : 'left');
    } else {
        playTile(tile, canPlayRight ? 'right' : 'left');
    }
}

// Play Tile
function playTile(tile, end) {
    const player = gameState.players[gameState.currentPlayerIdx];
    
    const leftEnd = gameState.chain[0].left;
    const rightEnd = gameState.chain[gameState.chain.length - 1].right;

    let validPlay = false;

    if (end === 'right') {
        if (tile.hasValue(rightEnd)) {
            if (tile.left === rightEnd) {
                // Keep as is
            } else {
                // Swap
                [tile.left, tile.right] = [tile.right, tile.left];
            }
            gameState.chain.push(tile);
            validPlay = true;
        }
    } else if (end === 'left') {
        if (tile.hasValue(leftEnd)) {
            if (tile.right === leftEnd) {
                // Keep as is
            } else {
                // Swap
                [tile.left, tile.right] = [tile.right, tile.left];
            }
            gameState.chain.unshift(tile);
            validPlay = true;
        }
    }

    if (validPlay) {
        player.playTile(tile);
        gameState.selectedTile = null;
        gameState.consecutivePasses = 0;

        // Check if player won
        if (player.hand.length === 0) {
            endRound(gameState.currentPlayerIdx);
            return;
        }

        gameState.currentPlayerIdx = (gameState.currentPlayerIdx + 1) % 4;
        
        // Auto-play for AI players
        automateNextPlayer();
    }
}

// Automate Next Player (AI logic)
function automateNextPlayer() {
    setTimeout(() => {
        const player = gameState.players[gameState.currentPlayerIdx];
        const leftEnd = gameState.chain[0].left;
        const rightEnd = gameState.chain[gameState.chain.length - 1].right;
        const validTiles = player.getValidTiles(leftEnd, rightEnd);

        if (validTiles.length === 0) {
            gameState.consecutivePasses++;
            
            if (gameState.consecutivePasses >= 4) {
                // Game is blocked
                blockGame();
                return;
            }

            gameState.currentPlayerIdx = (gameState.currentPlayerIdx + 1) % 4;
            automateNextPlayer();
        } else {
            // Randomly select a valid tile
            const tile = validTiles[Math.floor(Math.random() * validTiles.length)];
            const canPlayLeft = tile.hasValue(leftEnd);
            const canPlayRight = tile.hasValue(rightEnd);
            
            const end = canPlayRight ? 'right' : 'left';
            
            playTile(tile, end);
        }

        updateUI();
    }, 800);
}

// Pass Game
function passGame() {
    const player = gameState.players[gameState.currentPlayerIdx];
    
    if (gameState.currentPlayerIdx !== 1) {
        alert('Not your turn!');
        return;
    }

    gameState.consecutivePasses++;

    if (gameState.consecutivePasses >= 4) {
        blockGame();
        return;
    }

    gameState.currentPlayerIdx = (gameState.currentPlayerIdx + 1) % 4;
    document.getElementById('passBtn').disabled = true;
    automateNextPlayer();
}

// Block Game
function blockGame() {
    const team1Pips = gameState.teams[0].getTeamPips();
    const team2Pips = gameState.teams[1].getTeamPips();

    let winnerTeamIdx;
    let points;

    if (team1Pips < team2Pips) {
        winnerTeamIdx = 0;
        points = team2Pips - team1Pips;
    } else if (team2Pips < team1Pips) {
        winnerTeamIdx = 1;
        points = team1Pips - team2Pips;
    } else {
        // Tie - no winner
        showRoundEnd(null, team1Pips, team2Pips);
        return;
    }

    gameState.teams[winnerTeamIdx].addScore(points);
    showRoundEnd(winnerTeamIdx, team1Pips, team2Pips, true);
}

// End Round
function endRound(winnerPlayerIdx) {
    const player = gameState.players[winnerPlayerIdx];
    const winnerTeamIdx = player.teamId;
    const losingTeamIdx = 1 - winnerTeamIdx;
    const losingTeamPips = gameState.teams[losingTeamIdx].getTeamPips();

    gameState.teams[winnerTeamIdx].addScore(losingTeamPips);
    
    gameState.roundActive = false;
    showRoundEnd(winnerTeamIdx, gameState.teams[0].getTeamPips(), gameState.teams[1].getTeamPips());
}

// Show Round End
function showRoundEnd(winnerTeamIdx, team1Pips, team2Pips, isBlocked = false) {
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('roundEndScreen').classList.add('active');

    let resultHtml = '';

    if (winnerTeamIdx === null) {
        resultHtml = `<div class="result-item">Game was blocked!</div>`;
    } else {
        const team = gameState.teams[winnerTeamIdx];
        const teamColor = winnerTeamIdx === 0 ? 'team1' : 'team2';
        resultHtml = `<div class="result-item winner ${teamColor}">
                        🏆 Team ${winnerTeamIdx + 1} Wins! (${isBlocked ? 'Blocked Game' : 'Domino'})
                    </div>
                    <div class="result-item">
                        ${team.players[0].name} & ${team.players[1].name}
                    </div>`;
    }

    resultHtml += `<div style="margin-top: 20px;">
                        <div class="result-item team1">Team 1: ${gameState.teams[0].score} points</div>
                        <div class="result-item team2">Team 2: ${gameState.teams[1].score} points</div>
                    </div>`;

    document.getElementById('roundResult').innerHTML = resultHtml;

    // Check if game is over
    if (gameState.teams[0].score >= gameState.winningScore || gameState.teams[1].score >= gameState.winningScore) {
        document.getElementById('roundEndScreen').classList.remove('active');
        showGameOver();
    }
}

// Next Round
function nextRound() {
    document.getElementById('roundEndScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');
    startRound();
}

// Show Game Over
function showGameOver() {
    const winnerTeamIdx = gameState.teams[0].score >= gameState.winningScore ? 0 : 1;
    const winnerTeam = gameState.teams[winnerTeamIdx];
    const teamColor = winnerTeamIdx === 0 ? 'team1' : 'team2';

    let resultHtml = `
        <div class="result-item ${teamColor}">
            Team ${winnerTeamIdx + 1} Wins the Tournament!
        </div>
        <div class="result-item">
            <strong>${winnerTeam.players[0].name} & ${winnerTeam.players[1].name}</strong>
        </div>
        <div style="margin-top: 20px; font-size: 1.2em;">
            <div class="result-item ${teamColor}">Final Score: ${winnerTeam.score}</div>
        </div>
    `;

    document.getElementById('gameOverResult').innerHTML = resultHtml;

    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('gameOverScreen').classList.add('active');
}

// Reset Game
function resetGame() {
    gameState = {
        players: [],
        teams: [],
        currentRound: 0,
        currentPlayerIdx: 0,
        chain: [],
        deck: [],
        gameOver: false,
        roundActive: false,
        selectedTile: null,
        winningScore: 100,
        consecutivePasses: 0
    };

    // Clear inputs
    document.getElementById('player1').value = '';
    document.getElementById('player2').value = '';
    document.getElementById('player3').value = '';
    document.getElementById('player4').value = '';
    document.getElementById('winningScore').value = 100;

    document.getElementById('gameOverScreen').classList.remove('active');
    document.getElementById('roundEndScreen').classList.remove('active');
    document.getElementById('gameScreen').classList.remove('active');
    document.getElementById('setupScreen').classList.add('active');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('setupScreen').classList.add('active');
});
