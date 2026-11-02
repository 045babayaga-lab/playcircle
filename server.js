import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const rooms = new Map();

const WORDS = [
  { category: "Food", word: "Pizza" },
  { category: "Food", word: "Biryani" },
  { category: "Food", word: "Ice cream" },
  { category: "Animals", word: "Elephant" },
  { category: "Animals", word: "Penguin" },
  { category: "Places", word: "Beach" },
  { category: "Places", word: "Airport" },
  { category: "Places", word: "Hospital" },
  { category: "Things", word: "Umbrella" },
  { category: "Things", word: "Mobile phone" },
  { category: "Movies", word: "Cinema" },
  { category: "Sports", word: "Cricket" },
];

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const names = (room) => room.players.map((p) => p.name);
const findPlayer = (room, id) => room.players.find((p) => p.id === id);
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const isWordGame = (room) => room.game === "word" || room.game === "charades";

function winnerOf(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? "draw" : null;
}

function wordPublicState(room) {
  const g = room.round;
  const giver = findPlayer(room, g.giverId);
  return {
    game: room.game,
    mode: g.mode,
    phase: g.phase,
    giverId: g.giverId,
    giverName: giver ? giver.name : null,
    category: g.category,
    clue: g.clue,
    guesses: g.guesses,
    winnerName: g.winnerName,
    word: g.phase === "over" ? g.word : null,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    scores: room.players.map((p) => ({ name: p.name, score: p.score })),
  };
}

function publicState(room) {
  if (isWordGame(room)) return wordPublicState(room);

  const g = room.round;
  let turnId = null;
  if (g.phase === "playing") turnId = g.turnId;
  if (g.phase === "hints") turnId = g.order[g.turn] || null;
  const turnPlayer = turnId ? findPlayer(room, turnId) : null;
  return {
    game: room.game,
    phase: g.phase,
    board: g.board,
    marks: g.marks,
    turnId,
    turnName: turnPlayer ? turnPlayer.name : null,
    hints: g.hints,
    votedCount: Object.keys(g.votes || {}).length,
    total: room.players.length,
    winnerName: g.winnerName,
    results: g.results,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    scores: room.players.map((p) => ({ name: p.name, score: p.score })),
  };
}

function sendState(code, room) {
  if (!room.round) return;
  io.to(code).emit("round-state", publicState(room));
}

function skipGone(room) {
  const g = room.round;
  while (g.turn < g.order.length && !findPlayer(room, g.order[g.turn])) {
    g.turn++;
  }
  if (g.turn >= g.order.length) g.phase = "voting";
}

function finishVoting(room) {
  const g = room.round;
  const tally = {};
  Object.values(g.votes).forEach((t) => {
    tally[t] = (tally[t] || 0) + 1;
  });

  let top = null;
  let topCount = 0;
  let tie = false;
  for (const [id, count] of Object.entries(tally)) {
    if (count > topCount) {
      top = id;
      topCount = count;
      tie = false;
    } else if (count === topCount) {
      tie = true;
    }
  }

  const imposter = findPlayer(room, g.imposterId);
  const caught = !tie && top === g.imposterId;

  room.players.forEach((p) => {
    let delta = 0;
    if (imposter) {
      if (p.id === g.imposterId) {
        delta = caught ? 0 : 3;
      } else if (g.votes[p.id] === g.imposterId) {
        delta = 1;
      } else {
        p.wrong += 1;
        delta = p.wrong >= 2 ? -1 : 0;
      }
    }
    p.score += delta;
    p._delta = delta;
  });

  g.results = {
    imposterName: imposter ? imposter.name : "(left the game)",
    word: g.word,
    caught,
    votes: Object.entries(g.votes).map(([voter, target]) => ({
      voter: findPlayer(room, voter)?.name || "?",
      target: findPlayer(room, target)?.name || "?",
    })),
    deltas: room.players.map((p) => ({ name: p.name, delta: p._delta })),
  };
  g.phase = "results";
}

function checkVotingDone(room) {
  const g = room.round;
  if (g.phase !== "voting") return;
  const voted = Object.keys(g.votes).length;
  if (room.players.length > 0 && voted >= room.players.length) {
    finishVoting(room);
  }
}

function startWordRound(code, room) {
  room.wordRounds = (room.wordRounds || 0) + 1;
  const giver = room.players[(room.wordRounds - 1) % room.players.length];
  const pick = WORDS[Math.floor(Math.random() * WORDS.length)];
  const isCharades = room.game === "charades";
  const mode = isCharades ? (room.mode || "text") : null;

  room.round = {
    phase: mode === "draw" ? "guess" : "clue",
    giverId: giver.id,
    word: pick.word,
    category: pick.category,
    mode,
    clue: null,
    guesses: [],
    winnerName: null,
  };

  room.players.forEach((p) => {
    const isGiver = p.id === giver.id;
    io.to(p.id).emit("game-started", {
      game: room.game,
      mode,
      role: isGiver ? "giver" : "guesser",
      word: isGiver ? pick.word : null,
      category: pick.category,
    });
  });

  io.to(code).emit("draw-clear");
  sendState(code, room);
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ playerName, game, mode }, callback) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = {
      game: game || "imposter",
      mode: mode === "draw" ? "draw" : "text",
      host: socket.id,
      players: [{ id: socket.id, name: playerName || "Player", score: 0, wrong: 0 }],
      round: null,
    };
    rooms.set(roomCode, room);
    socket.join(roomCode);

    callback?.({ success: true, roomCode, players: names(room) });
  });

  socket.on("join-room", ({ roomCode, playerName }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      callback?.({ success: false, message: "Room not found" });
      return;
    }
    if (room.players.length >= 20) {
      callback?.({ success: false, message: "Room is full" });
      return;
    }

    room.players.push({ id: socket.id, name: playerName || "Player", score: 0, wrong: 0 });
    socket.join(code);

    io.to(code).emit("players-updated", names(room));
    callback?.({ success: true, roomCode: code, players: names(room) });
  });

  socket.on("start-game", ({ roomCode }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      callback?.({ success: false, message: "Room not found" });
      return;
    }
    if (room.host !== socket.id) {
      callback?.({ success: false, message: "Only the host can start the game" });
      return;
    }

    if (room.game === "tictactoe") {
      if (room.players.length !== 2) {
        callback?.({ success: false, message: "Tic-Tac-Toe needs exactly 2 players" });
        return;
      }
      const [p1, p2] = shuffle(room.players);
      room.round = {
        phase: "playing",
        board: Array(9).fill(null),
        marks: { [p1.id]: "X", [p2.id]: "O" },
        turnId: p1.id,
        winnerName: null,
      };
      room.players.forEach((p) => {
        io.to(p.id).emit("game-started", {
          game: "tictactoe",
          mark: room.round.marks[p.id],
        });
      });
      sendState(code, room);
      callback?.({ success: true });
      return;
    }

    if (room.players.length < 2) {
      callback?.({ success: false, message: "Need at least 2 players to start" });
      return;
    }

    if (isWordGame(room)) {
      startWordRound(code, room);
      callback?.({ success: true });
      return;
    }

    const pick = WORDS[Math.floor(Math.random() * WORDS.length)];
    const imposterIndex = Math.floor(Math.random() * room.players.length);
    const imposterId = room.players[imposterIndex].id;

    room.round = {
      phase: "hints",
      word: pick.word,
      imposterId,
      order: shuffle(room.players.map((p) => p.id)),
      turn: 0,
      hints: [],
      votes: {},
      results: null,
    };

    room.players.forEach((p) => {
      const isImposter = p.id === imposterId;
      io.to(p.id).emit("game-started", {
        game: "imposter",
        role: isImposter ? "imposter" : "player",
        word: isImposter ? null : pick.word,
        category: pick.category,
      });
    });

    sendState(code, room);
    callback?.({ success: true });
  });

  socket.on("draw-stroke", ({ roomCode, stroke }) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;
    if (!g || room.game !== "charades" || g.giverId !== socket.id) return;
    socket.to(code).emit("draw-stroke", stroke);
  });

  socket.on("draw-clear", ({ roomCode }) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;
    if (!g || room.game !== "charades" || g.giverId !== socket.id) return;
    socket.to(code).emit("draw-clear");
  });

  socket.on("submit-clue", ({ roomCode, clue }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;

    if (!g || !isWordGame(room) || g.phase !== "clue") {
      callback?.({ success: false, message: "Not clue time" });
      return;
    }
    if (g.giverId !== socket.id) {
      callback?.({ success: false, message: "It is not your turn to give a clue" });
      return;
    }
    const text = String(clue || "").trim().slice(0, 40);
    if (!text) {
      callback?.({ success: false, message: "Write a clue first" });
      return;
    }
    if (text.toLowerCase() === g.word.toLowerCase()) {
      callback?.({ success: false, message: "Don't write the word itself" });
      return;
    }

    g.clue = text;
    g.phase = "guess";
    sendState(code, room);
    callback?.({ success: true });
  });

  socket.on("submit-guess", ({ roomCode, guess }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;

    if (!g || !isWordGame(room) || g.phase !== "guess") {
      callback?.({ success: false, message: "Not guessing time" });
      return;
    }
    if (g.giverId === socket.id) {
      callback?.({ success: false, message: "The clue giver cannot guess" });
      return;
    }
    const text = String(guess || "").trim().slice(0, 40);
    if (!text) {
      callback?.({ success: false, message: "Write a guess first" });
      return;
    }

    const player = findPlayer(room, socket.id);
    const correct = text.toLowerCase() === g.word.toLowerCase();
    g.guesses.push({ name: player.name, text, correct });

    if (correct) {
      g.phase = "over";
      g.winnerName = player.name;
      player.score += 2;
      const giver = findPlayer(room, g.giverId);
      if (giver) giver.score += 1;
    }

    sendState(code, room);
    callback?.({ success: true });
  });

  socket.on("make-move", ({ roomCode, index }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;

    if (!g || room.game !== "tictactoe" || g.phase !== "playing") {
      callback?.({ success: false, message: "No game in progress" });
      return;
    }
    if (g.turnId !== socket.id) {
      callback?.({ success: false, message: "It is not your turn" });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index > 8 || g.board[index]) {
      callback?.({ success: false, message: "Pick an empty box" });
      return;
    }

    g.board[index] = g.marks[socket.id];
    const result = winnerOf(g.board);

    if (result) {
      g.phase = "over";
      if (result === "draw") {
        g.winnerName = "Draw";
      } else {
        const winner = findPlayer(room, socket.id);
        g.winnerName = winner.name;
        winner.score += 1;
      }
    } else {
      const other = room.players.find((p) => p.id !== socket.id);
      g.turnId = other.id;
    }

    sendState(code, room);
    callback?.({ success: true });
  });

  socket.on("submit-hint", ({ roomCode, hint }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;

    if (!g || g.phase !== "hints") {
      callback?.({ success: false, message: "Not hint time" });
      return;
    }
    if (g.order[g.turn] !== socket.id) {
      callback?.({ success: false, message: "It is not your turn" });
      return;
    }
    const clean = String(hint || "").trim().slice(0, 40);
    if (!clean) {
      callback?.({ success: false, message: "Write a hint first" });
      return;
    }

    g.hints.push({ name: findPlayer(room, socket.id).name, hint: clean });
    g.turn++;
    skipGone(room);
    sendState(code, room);
    callback?.({ success: true });
  });

  socket.on("submit-vote", ({ roomCode, targetId }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);
    const g = room?.round;

    if (!g || g.phase !== "voting") {
      callback?.({ success: false, message: "Not voting time" });
      return;
    }
    if (g.votes[socket.id]) {
      callback?.({ success: false, message: "You already voted" });
      return;
    }
    if (targetId === socket.id || !findPlayer(room, targetId)) {
      callback?.({ success: false, message: "Pick another player" });
      return;
    }

    g.votes[socket.id] = targetId;
    checkVotingDone(room);
    sendState(code, room);
    callback?.({ success: true });
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      const before = room.players.length;
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.players.length === before) continue;

      if (room.players.length === 0) {
        rooms.delete(code);
        continue;
      }

      if (room.host === socket.id) room.host = room.players[0].id;
      io.to(code).emit("players-updated", names(room));

      if (room.round) {
        if (room.game === "tictactoe" && room.round.phase === "playing") {
          room.round.phase = "over";
          room.round.winnerName = "A player left";
        } else if (room.game === "imposter" && room.round.phase === "hints") {
          skipGone(room);
        } else if (isWordGame(room) && room.round.phase !== "over" && !findPlayer(room, room.round.giverId)) {
          room.round.phase = "over";
          room.round.winnerName = "The clue giver left";
        }
        checkVotingDone(room);
        sendState(code, room);
      }
    }
  });
});

app.get("/", (req, res) => {
  res.send("PlayCircle multiplayer server is running!");
});

httpServer.listen(3001, "0.0.0.0", () => {
  console.log("PlayCircle server running on port 3001");
});
