const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir archivos estáticos
app.use(express.static('public'));

// Estructura de datos para partidas:
// {
//   roomCode: {
//     hostSocketId: 'xxxx',
//     players: {
//       socketId: {name: 'Juan', time: null, clicked: false}
//     },
//     gameStarted: false,
//     screenRed: false,
//     startRedTime: null
//   }
// }
const rooms = {};

io.on('connection', (socket) => {
  console.log('Un usuario se ha conectado', socket.id);

  // Crear una partida
  socket.on('createRoom', () => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      hostSocketId: socket.id,
      players: {},
      gameStarted: false,
      screenRed: false,
      startRedTime: null
    };
    socket.join(roomCode);
    io.to(socket.id).emit('roomCreated', roomCode);
  });

  // Unirse a una partida
  socket.on('joinRoom', ({roomCode, username}) => {
    if (!rooms[roomCode]) {
      socket.emit('errorMessage', 'No existe esa partida.');
      return;
    }

    // Evitar unir al host nuevamente
    if (socket.id === rooms[roomCode].hostSocketId) {
      socket.emit('errorMessage', 'Ya eres el host de esta partida.');
      return;
    }

    // Agregar jugador
    rooms[roomCode].players[socket.id] = {
      name: username,
      time: null,
      clicked: false,
      score: 0
    };

    socket.join(roomCode);
    socket.emit('joinedRoom', roomCode);
    updatePlayerList(roomCode);
  });

  // Empezar el juego (solo host)
  socket.on('startGame', (roomCode) => {
    if (!rooms[roomCode]) return;
    if (rooms[roomCode].hostSocketId !== socket.id) return; // solo el host
    // Iniciar ronda: pantalla blanca y luego roja aleatoria
    rooms[roomCode].gameStarted = true;
    rooms[roomCode].screenRed = false;
    rooms[roomCode].startRedTime = null;

    io.to(roomCode).emit('gameWaiting'); // todos muestran "espera que se ponga roja"

    // Después de tiempo aleatorio, poner pantalla roja
    const randomTime = Math.random() * 3000 + 2000; // entre 2 y 5 segundos
    setTimeout(() => {
      if (!rooms[roomCode]) return;
      rooms[roomCode].screenRed = true;
      rooms[roomCode].startRedTime = Date.now();
      io.to(roomCode).emit('gameRed'); // "pulsa ya"
    }, randomTime);
  });

  // Jugador pulsa cuando pantalla está roja
  socket.on('playerClicked', (roomCode) => {
    if (!rooms[roomCode]) return;

    const room = rooms[roomCode];
    if (!room.screenRed) return; // si aún no está en rojo, no cuenta

    // Calcular tiempo
    const playerData = room.players[socket.id] || (socket.id === room.hostSocketId ? {name:"Host"} : null);
    if (!playerData) return;
    if (playerData.clicked === true) return; // ya pulsó

    const clickTime = Date.now();
    const diff = (clickTime - room.startRedTime) / 1000; // en segundos
    playerData.time = diff;
    playerData.clicked = true;

    // Chequear si todos ya pulsaron (o pasó un tiempo)
    // Pero el juego podría continuar hasta que todos hagan click
    const allClicked = checkAllClicked(roomCode);
    if (allClicked) {
      showRanking(roomCode);
    }
  });

  // Host pasa a siguiente juego
  socket.on('nextGame', (roomCode) => {
    if (!rooms[roomCode]) return;
    if (rooms[roomCode].hostSocketId !== socket.id) return;
    // Reiniciamos tiempo y clicks
    for (let pid in rooms[roomCode].players) {
      rooms[roomCode].players[pid].time = null;
      rooms[roomCode].players[pid].clicked = false;
    }
    rooms[roomCode].gameStarted = false;
    rooms[roomCode].screenRed = false;
    rooms[roomCode].startRedTime = null;

    io.to(roomCode).emit('showLobby'); // volver a la pantalla de espera con botón "Empezar" (solo host)
    updatePlayerList(roomCode);
  });

  socket.on('disconnect', () => {
    console.log('Un usuario se ha desconectado', socket.id);
    // Remover jugador/sala si corresponde
    removePlayerFromRooms(socket.id);
  });
});

function generateRoomCode() {
  return uuidv4().slice(0,5).toUpperCase(); // un código corto
}

function removePlayerFromRooms(socketId) {
  for (let roomCode in rooms) {
    const room = rooms[roomCode];
    if (room.hostSocketId === socketId) {
      // Host se fue, borramos sala
      io.to(roomCode).emit('errorMessage', 'El host se ha desconectado, la partida se cancela.');
      delete rooms[roomCode];
      break;
    } else if (room.players[socketId]) {
      delete room.players[socketId];
      updatePlayerList(roomCode);
    }
  }
}

function updatePlayerList(roomCode) {
  if (!rooms[roomCode]) return;
  const room = rooms[roomCode];
  const playersList = Object.values(room.players).map(p => p.name);
  const hostName = "Host"; // Podrías permitir que el host también tenga un nombre
  io.to(roomCode).emit('playerList', [hostName, ...playersList]);
}

function checkAllClicked(roomCode) {
  if (!rooms[roomCode]) return false;
  const room = rooms[roomCode];

  // Host no suma ni resta, ya que no se pidió que host jugara, pero se podría incluir
  // Suponiendo que host también juega:
  let totalPlayers = Object.keys(room.players).length;
  let clickedCount = 0;
  for (let pid in room.players) {
    if (room.players[pid].clicked) clickedCount++;
  }

  // Si todos han hecho click
  return clickedCount === totalPlayers;
}

function showRanking(roomCode) {
  if (!rooms[roomCode]) return;
  const room = rooms[roomCode];

  // Crear ranking
  // Ordenar por tiempo ascendente
  const rankingArray = Object.entries(room.players).map(([pid, data]) => {
    return {name: data.name, time: data.time};
  });
  rankingArray.sort((a,b) => a.time - b.time);

  // Asignar puntos: primer lugar más puntos
  // Ej: si hay 3 jugadores: 1er=3pt, 2do=2pt, 3ro=1pt
  const total = rankingArray.length;
  rankingArray.forEach((p,i) => {
    const points = total - i; // si i=0 => total-0 = total (max points)
    p.points = points;
  });

  // Actualizar puntuaciones en room
  rankingArray.forEach(r => {
    // Buscar el jugador y sumarle puntos
    const playerEntry = Object.entries(room.players).find(([,data]) => data.name === r.name);
    if (playerEntry) {
      playerEntry[1].score = (playerEntry[1].score || 0) + r.points;
    }
  });

  io.to(roomCode).emit('showRanking', rankingArray);
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
