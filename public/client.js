const socket = io();

// Elementos del DOM
const initialScreen = document.getElementById('initial-screen');
const hostScreen = document.getElementById('host-screen');
const playerWaitScreen = document.getElementById('player-wait-screen');
const gameWaitingScreen = document.getElementById('game-waiting-screen');
const gameRedScreen = document.getElementById('game-red-screen');
const rankingScreen = document.getElementById('ranking-screen');

const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinCodeInput = document.getElementById('join-code');
const usernameInput = document.getElementById('username');
const roomCodeSpan = document.getElementById('room-code');
const roomCodePlayerSpan = document.getElementById('room-code-player');
const playerListHost = document.getElementById('player-list-host');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');
const hostError = document.getElementById('host-error');
const clickBtn = document.getElementById('click-btn');
const rankingList = document.getElementById('ranking-list');
const nextGameBtn = document.getElementById('next-game-btn');

let currentRoomCode = null;
let isHost = false;

// Crear partida
createRoomBtn.addEventListener('click', () => {
  socket.emit('createRoom');
});

// Unirse a partida
joinRoomBtn.addEventListener('click', () => {
  const roomCode = joinCodeInput.value.trim();
  const username = usernameInput.value.trim();
  if (!roomCode || !username) {
    alert('Completa el código de la partida y tu nombre');
    return;
  }
  socket.emit('joinRoom', {roomCode, username});
});

// Empezar juego (host)
startGameBtn.addEventListener('click', () => {
  if (!currentRoomCode || !isHost) return;
  socket.emit('startGame', currentRoomCode);
});

// Pulsar cuando rojo
clickBtn.addEventListener('click', () => {
  if (!currentRoomCode) return;
  socket.emit('playerClicked', currentRoomCode);
});

// Siguiente juego (host)
nextGameBtn.addEventListener('click', () => {
  socket.emit('nextGame', currentRoomCode);
});

// Eventos del servidor
socket.on('roomCreated', (roomCode) => {
  isHost = true;
  currentRoomCode = roomCode;
  showHostScreen();
});

socket.on('errorMessage', (msg) => {
  alert(msg);
});

socket.on('joinedRoom', (roomCode) => {
  isHost = false;
  currentRoomCode = roomCode;
  showPlayerWaitScreen();
});

socket.on('playerList', (players) => {
  updatePlayerLists(players);
});

socket.on('gameWaiting', () => {
  showGameWaitingScreen();
});

socket.on('gameRed', () => {
  showGameRedScreen();
});

socket.on('showRanking', (rankingArray) => {
  showRanking(rankingArray);
});

socket.on('showLobby', () => {
  if (isHost) {
    showHostScreen();
  } else {
    showPlayerWaitScreen();
  }
});

// Funciones de UI
function showHostScreen() {
  hideAll();
  hostScreen.classList.remove('hidden');
  roomCodeSpan.textContent = currentRoomCode;
}

function showPlayerWaitScreen() {
  hideAll();
  playerWaitScreen.classList.remove('hidden');
  roomCodePlayerSpan.textContent = currentRoomCode;
}

function showGameWaitingScreen() {
  hideAll();
  gameWaitingScreen.classList.remove('hidden');
}

function showGameRedScreen() {
  hideAll();
  gameRedScreen.classList.remove('hidden');
}

function showRanking(rankingArray) {
  hideAll();
  rankingScreen.classList.remove('hidden');
  rankingList.innerHTML = '';
  let rank = 1;
  for (const player of rankingArray) {
    const li = document.createElement('li');
    li.textContent = `${rank}. ${player.name} - ${player.time.toFixed(2)}s - ${player.points}pt`;
    rankingList.appendChild(li);
    rank++;
  }
}

function hideAll() {
  initialScreen.classList.add('hidden');
  hostScreen.classList.add('hidden');
  playerWaitScreen.classList.add('hidden');
  gameWaitingScreen.classList.add('hidden');
  gameRedScreen.classList.add('hidden');
  rankingScreen.classList.add('hidden');
}

function updatePlayerLists(players) {
  playerListHost.innerHTML = '';
  playerList.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p;
    playerListHost.appendChild(li.cloneNode(true));
    playerList.appendChild(li);
  });
}
