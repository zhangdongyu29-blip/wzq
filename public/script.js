const socket = io();
const boardElement = document.getElementById('board');
const connectionStatus = document.getElementById('connection-status');
const myAvatar = document.getElementById('my-avatar');
const myName = document.getElementById('my-name');
const myRole = document.getElementById('my-role');
const winnerModal = document.getElementById('winner-modal');
const winnerText = document.getElementById('winner-text');
const btnReset = document.getElementById('btn-reset');

const BOARD_SIZE = 15;
let myId = null;
let currentTurn = 'black';
let gameStatus = 'waiting';
let myColor = null;

// Initialize Board
function initBoard() {
    boardElement.innerHTML = '';
    
    // Add Star Points (Tian Yuan & Hoshi)
    const starPoints = [
        {r: 3, c: 3}, {r: 3, c: 11},
        {r: 7, c: 7},
        {r: 11, c: 3}, {r: 11, c: 11}
    ];

    starPoints.forEach(p => {
        const dot = document.createElement('div');
        dot.classList.add('star-point');
        // Calculate position based on percentage or pixel
        // 40px * 15 = 600px.
        // Cell centers are at 20 + c*40.
        dot.style.left = (20 + p.c * 40) + 'px';
        dot.style.top = (20 + p.r * 40) + 'px';
        boardElement.appendChild(dot);
    });

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.addEventListener('click', () => handleCellClick(r, c));
            boardElement.appendChild(cell);
        }
    }
}

function handleCellClick(row, col) {
    console.log('Click:', { gameStatus, myColor, currentTurn });
    if (gameStatus !== 'playing') {
        console.log('Game not playing, status:', gameStatus);
        return;
    }
    if (myColor !== currentTurn) {
        console.log('Not my turn:', myColor, 'vs', currentTurn);
        return;
    }
    
    // Check if cell is occupied (visually) - look for piece element
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    if (cell.querySelector('.piece')) return;

    socket.emit('move', { row, col });
}

// Socket Events

socket.on('connect', () => {
    myId = socket.id;
    connectionStatus.textContent = 'ONLINE';
    connectionStatus.classList.replace('offline', 'online');
});

socket.on('init', (data) => {
    myId = data.user.id;
    updateSelfInfo(data.user, data.role);
    updatePlayers(data.players);
    updateBoard(data.board);
    
    gameStatus = data.gameStatus;
    currentTurn = data.currentTurn;
    updateTurnIndicator();

    if (gameStatus === 'finished') {
        // Maybe show who won if we joined late?
    }
});

socket.on('updatePlayers', (players) => {
    updatePlayers(players);
});

socket.on('gameStart', (data) => {
    gameStatus = 'playing';
    currentTurn = data.currentTurn;
    winnerModal.classList.add('hidden');
    
    // Clear board visually
    document.querySelectorAll('.cell').forEach(cell => cell.innerHTML = '');
    updateTurnIndicator();
    
    // Hide Ready Buttons and clear status
    document.getElementById('btn-ready-black').classList.add('hidden');
    document.getElementById('btn-ready-white').classList.add('hidden');
    document.getElementById('status-black').textContent = '';
    document.getElementById('status-white').textContent = '';
});

socket.on('moveMade', (data) => {
    const { row, col, color } = data;
    placePiece(row, col, color);
    
    // Remove last-move marker from previous
    const last = document.querySelector('.piece.last-move');
    if (last) last.classList.remove('last-move');

    // Add to new
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    if (cell && cell.firstChild) {
        cell.firstChild.classList.add('last-move');
    }
});

socket.on('turnChange', (data) => {
    currentTurn = data.currentTurn;
    updateTurnIndicator();
});

socket.on('gameOver', (data) => {
    gameStatus = 'finished';
    const winnerName = data.winner === myColor ? 'YOU WIN!' : 'YOU LOSE!';
    winnerText.textContent = winnerName;
    winnerText.style.color = data.winner === 'black' ? 'var(--neon-pink)' : 'var(--neon-blue)';
    winnerModal.classList.remove('hidden');
});

socket.on('gameReset', () => {
    gameStatus = 'waiting';
    winnerModal.classList.add('hidden');
    document.querySelectorAll('.cell').forEach(cell => cell.innerHTML = '');
    
    // Reset UI ready states
    const sides = ['black', 'white'];
    sides.forEach(side => {
        const btn = document.getElementById(`btn-ready-${side}`);
        btn.classList.remove('ready');
        btn.textContent = 'READY';
    });
});

socket.on('playerLeft', () => {
    alert('A player has disconnected. Game reset.');
    // The server will also send gameReset/updatePlayers
});

// UI Helper Functions

function updateSelfInfo(user, role) {
    myAvatar.src = user.avatar;
    myName.textContent = user.name;
    myRole.textContent = role.toUpperCase();
    myColor = user.color;
}

function updatePlayers(players) {
    const playerArray = Object.values(players);
    const blackPlayer = playerArray.find(p => p.color === 'black');
    const whitePlayer = playerArray.find(p => p.color === 'white');

    updatePlayerPanel('black', blackPlayer);
    updatePlayerPanel('white', whitePlayer);
}

function updatePlayerPanel(color, player) {
    const nameEl = document.getElementById(`name-${color}`);
    const avatarEl = document.getElementById(`avatar-${color}`);
    const statusEl = document.getElementById(`status-${color}`); // Use the status div
    const btnReady = document.getElementById(`btn-ready-${color}`);

    if (player) {
        avatarEl.src = player.avatar;
        
        // Reset status text
        statusEl.textContent = '';
        statusEl.style.color = '#888';

        // Show ready button if it's me AND game is waiting
        if (myId === player.id) {
            nameEl.textContent = 'YOU';
            if (gameStatus === 'waiting') {
                btnReady.classList.remove('hidden');
                if (player.ready) {
                    btnReady.classList.add('ready');
                    btnReady.textContent = 'READY';
                    statusEl.textContent = '';
                } else {
                    btnReady.classList.remove('ready');
                    btnReady.textContent = 'READY';
                    statusEl.textContent = '';
                }
            } else {
                 btnReady.classList.add('hidden');
                 statusEl.textContent = '';
            }
        } else {
            nameEl.textContent = 'OPPONENT';
            btnReady.classList.add('hidden');
            if (gameStatus === 'waiting') {
                statusEl.textContent = player.ready ? 'READY' : 'WAITING';
                statusEl.style.color = player.ready ? '#00ff9d' : '#888';
            } else {
                statusEl.textContent = '';
            }
        }
    } else {
        nameEl.textContent = 'WAITING...';
        avatarEl.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzMzMyIvPjwvc3ZnPg=='; // Placeholder
        if (statusEl) statusEl.textContent = '';
        btnReady.classList.add('hidden');
    }
}

function updateTurnIndicator() {
    document.getElementById('player-black').classList.remove('active-turn');
    document.getElementById('player-white').classList.remove('active-turn');
    
    if (gameStatus === 'playing') {
        document.getElementById(`player-${currentTurn}`).classList.add('active-turn');
    }
}

function updateBoard(boardData) {
    // Sync full board (for reconnection/init)
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const val = boardData[r][c];
            const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
            cell.innerHTML = ''; // clear
            if (val) {
                placePiece(r, c, val);
            }
        }
    }
}

function placePiece(row, col, color) {
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    if (!cell.hasChildNodes()) {
        const piece = document.createElement('div');
        piece.classList.add('piece', color);
        cell.appendChild(piece);

        // Add ripple effect
        const ripple = document.createElement('div');
        ripple.classList.add('ripple');
        cell.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => {
            if (ripple.parentNode === cell) {
                cell.removeChild(ripple);
            }
        }, 600);
    }
}

// Event Listeners
document.getElementById('btn-ready-black').addEventListener('click', (e) => {
    if (!e.target.classList.contains('ready')) {
        console.log('Sending ready event for black');
        e.target.textContent = 'SENDING...';
        socket.emit('ready');
    }
});
document.getElementById('btn-ready-white').addEventListener('click', (e) => {
    if (!e.target.classList.contains('ready')) {
        console.log('Sending ready event for white');
        e.target.textContent = 'SENDING...';
        socket.emit('ready');
    }
});
btnReset.addEventListener('click', () => {
    socket.emit('reset');
});

initBoard();
