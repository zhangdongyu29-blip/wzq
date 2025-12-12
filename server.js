const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态
let players = {}; // socketId -> { id, name, avatar, color, ready }
let spectators = {};
let gameStatus = 'waiting'; // waiting, playing, finished
let currentTurn = 'black'; // black or white
let board = []; // 15x15
const BOARD_SIZE = 15;

function initBoard() {
    board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
}

function checkWin(row, col, color) {
    const directions = [
        [[0, 1], [0, -1]], // Horizontal
        [[1, 0], [-1, 0]], // Vertical
        [[1, 1], [-1, -1]], // Diagonal \
        [[1, -1], [-1, 1]]  // Diagonal /
    ];

    for (let axis of directions) {
        let count = 1;
        for (let dir of axis) {
            let r = row + dir[0];
            let c = col + dir[1];
            while (
                r >= 0 && r < BOARD_SIZE &&
                c >= 0 && c < BOARD_SIZE &&
                board[r][c] === color
            ) {
                count++;
                r += dir[0];
                c += dir[1];
            }
        }
        if (count >= 5) return true;
    }
    return false;
}

initBoard();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 获取 IP 地址
    let clientIp = socket.handshake.address;
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substr(7);
    }
    
    const user = {
        id: socket.id,
        name: clientIp,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${socket.id}`,
        ready: false,
        color: null // 'black' or 'white'
    };

    // 尝试加入游戏（作为玩家）
    let assigned = false;
    const currentPlayers = Object.values(players);
    if (currentPlayers.length < 2) {
        if (!currentPlayers.some(p => p.color === 'black')) {
            user.color = 'black';
        } else {
            user.color = 'white';
        }
        players[socket.id] = user;
        assigned = true;
    } else {
        spectators[socket.id] = user;
    }

    // 发送当前状态给新连接的用户
    socket.emit('init', {
        user: user,
        players: players,
        gameStatus: gameStatus,
        board: board,
        currentTurn: currentTurn,
        role: assigned ? 'player' : 'spectator'
    });

    // 广播更新玩家列表
    io.emit('updatePlayers', players);

    // 准备
    socket.on('ready', () => {
        if (players[socket.id] && gameStatus === 'waiting') {
            // 只允许从未准备变为已准备
            if (!players[socket.id].ready) {
                players[socket.id].ready = true;
                io.emit('updatePlayers', players);

                // 检查是否都准备好了
                const ps = Object.values(players);
                if (ps.length === 2 && ps.every(p => p.ready)) {
                    // Small delay to let the UI update
                    setTimeout(() => {
                        gameStatus = 'playing';
                        initBoard();
                        currentTurn = 'black';
                        io.emit('gameStart', { currentTurn });
                    }, 500);
                }
            }
        }
    });

    // 落子
    socket.on('move', ({ row, col }) => {
        if (
            gameStatus === 'playing' &&
            players[socket.id] &&
            players[socket.id].color === currentTurn &&
            board[row][col] === null
        ) {
            board[row][col] = currentTurn;
            const win = checkWin(row, col, currentTurn);
            
            io.emit('moveMade', { row, col, color: currentTurn });

            if (win) {
                gameStatus = 'finished';
                io.emit('gameOver', { winner: currentTurn });
                // 重置准备状态
                Object.values(players).forEach(p => p.ready = false);
                io.emit('updatePlayers', players);
            } else {
                currentTurn = currentTurn === 'black' ? 'white' : 'black';
                io.emit('turnChange', { currentTurn });
            }
        }
    });

    // 断开连接
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            delete players[socket.id];
            gameStatus = 'waiting';
            initBoard();
            // 重置剩余玩家状态
            Object.values(players).forEach(p => p.ready = false);
            
            // 尝试从观众中替补? (简化起见，暂时不自动替补，只是重置游戏)
            io.emit('playerLeft');
            io.emit('updatePlayers', players);
            // 如果游戏正在进行，强制结束
            io.emit('gameReset'); 
        } else if (spectators[socket.id]) {
            delete spectators[socket.id];
        }
    });
    
    // 重置游戏
    socket.on('reset', () => {
         // 只有玩家可以重置? 或者方便调试允许任何人重置
         if(players[socket.id]) {
             gameStatus = 'waiting';
             initBoard();
             Object.values(players).forEach(p => p.ready = false);
             io.emit('gameReset');
             io.emit('updatePlayers', players);
         }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
