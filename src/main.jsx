import React, { useState, useEffect, useRef } from 'react';
import { io } from "socket.io-client";
import { createRoot } from 'react-dom/client';
import { Users, Plus, DoorOpen, Sparkles, Gamepad2, ShieldCheck, X, Copy, Check, ArrowRight, Menu, Crown, Clock3 } from 'lucide-react';
import './styles.css';

const socket = io(`http://${window.location.hostname}:3001`);

const games = [
  { id: 'imposter', name: 'Imposter', category: 'Guess & bluff', players: '4–10 players', time: '10–15 min', emoji: '🕵️', color: 'lavender', description: 'One secret imposter. Can your group figure out who it is?' },
  { id: 'quiz', name: 'Family Quiz', category: 'Trivia', players: '2–20 players', time: '5–10 min', emoji: '🧠', color: 'peach', description: 'Put your knowledge to the test with fun questions.' },
  { id: 'draw', name: 'Draw & Guess', category: 'Creative', players: '3–12 players', time: '10 min', emoji: '🎨', color: 'mint', description: 'Draw a mystery word while everyone races to guess it.' },
  { id: 'word', name: 'Word Battle', category: 'Word game', players: '2–8 players', time: '5 min', emoji: '🔤', color: 'sky', description: 'Quick clues, clever guesses and friendly competition.' },
  { id: 'charades', name: 'Dumb Charades', category: 'Acting', players: '3–10 players', time: '10 min', emoji: '🎭', color: 'peach', description: 'Act it out or draw it. Others guess the word.' },
  { id: 'memory', name: 'Memory Match', category: 'Brain game', players: '2–6 players', time: '5 min', emoji: '🧩', color: 'yellow', description: 'Find matching pairs and see who remembers the most.' },
  { id: 'tictactoe', name: 'Tic-Tac-Toe', category: 'Classic', players: '2 players', time: '2 min', emoji: '⭕', color: 'pink', description: 'A timeless little battle of Xs and Os.' },
];

const pname = (p) => (typeof p === 'string' ? p : p.name);

const cellStyle = {
  aspectRatio: '1',
  minHeight: 70,
  fontSize: 32,
  fontWeight: 700,
  borderRadius: 12,
  border: '2px solid #7c6cf0',
  background: '#ede9fe',
  color: '#333',
  cursor: 'pointer',
};

function DrawCanvas({ enabled, roomCode }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  const pos = (e, c) => {
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) };
  };

  const drawLine = (a, b) => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  useEffect(() => {
    const onStroke = (s) => drawLine(s.from, s.to);
    const onClear = () => {
      const c = canvasRef.current;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    };
    socket.on("draw-stroke", onStroke);
    socket.on("draw-clear", onClear);
    return () => {
      socket.off("draw-stroke", onStroke);
      socket.off("draw-clear", onClear);
    };
  }, []);

  const start = (e) => {
    if (!enabled) return;
    drawing.current = true;
    last.current = pos(e, canvasRef.current);
  };

  const move = (e) => {
    if (!enabled || !drawing.current) return;
    const p = pos(e, canvasRef.current);
    drawLine(last.current, p);
    socket.emit("draw-stroke", { roomCode, stroke: { from: last.current, to: p } });
    last.current = p;
  };

  const end = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    socket.emit("draw-clear", { roomCode });
  };

  return <div>
    <canvas
      ref={canvasRef}
      width={600}
      height={450}
      onMouseDown={start}
      onMouseMove={move}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      style={{ width: '100%', background: '#fff', borderRadius: 12, border: '2px solid #7c6cf0', touchAction: 'none', cursor: enabled ? 'crosshair' : 'default' }}
    />
    {enabled && <button className="btn btn-secondary full" onClick={clear}>Clear drawing</button>}
  </div>;
}

function App() {
  const [modal, setModal] = useState(null);
  const [selectedGame, setSelectedGame] = useState('imposter');
  const [selectedMode, setSelectedMode] = useState('text');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [players, setPlayers] = useState([]);
  const [gameData, setGameData] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [roundState, setRoundState] = useState(null);
  const [hintText, setHintText] = useState('');
  const [myVote, setMyVote] = useState(null);
  const [clueText, setClueText] = useState('');
  const [guessText, setGuessText] = useState('');
  useEffect(() => {
    socket.on("players-updated", (updatedPlayers) => {
      setPlayers(updatedPlayers);
    });
    socket.on("game-started", (data) => {
      setGameData(data);
      setRevealed(false);
      setRoundState(null);
      setHintText('');
      setMyVote(null);
      setClueText('');
      setGuessText('');
      setNotice('');
      setModal('game');
    });
    socket.on("round-state", (state) => {
      setRoundState(state);
    });
    return () => {
      socket.off("players-updated");
      socket.off("game-started");
      socket.off("round-state");
    };
  }, []);

  const activeCode = createdCode || roomCode;

  const openCreate = (game = 'imposter') => { setSelectedGame(game); setSelectedMode('text'); setCreatedCode(''); setPlayers([]); setNotice(''); setModal('create'); };

  const createRoom = (e) => {
    e.preventDefault();
    socket.emit("create-room", { playerName: playerName || "Player", game: selectedGame, mode: selectedMode }, (response) => {
      if (response.success) {
        setCreatedCode(response.roomCode);
        setPlayers(response.players);
        setNotice("");
      } else {
        setNotice(response.message || "Could not create room.");
      }
    });
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (roomCode.trim().length < 4) {
      setNotice("Enter a valid room code to continue.");
      return;
    }
    socket.emit(
      "join-room",
      { roomCode: roomCode.trim(), playerName: playerName || "Player" },
      (response) => {
        if (response.success) {
          setPlayers(response.players);
          setNotice(`Joined room ${response.roomCode}! Waiting for the host to start the game...`);
        } else {
          setNotice(response.message || "Could not join the room.");
        }
      }
    );
  };

  const startGame = () => {
    socket.emit("start-game", { roomCode: createdCode }, (response) => {
      if (response && !response.success) {
        setNotice(response.message || "Could not start the game.");
      }
    });
  };

  const sendHint = (e) => {
    e.preventDefault();
    socket.emit("submit-hint", { roomCode: activeCode, hint: hintText }, (res) => {
      if (res && res.success) {
        setHintText('');
        setNotice('');
      } else {
        setNotice((res && res.message) || "Could not send hint.");
      }
    });
  };

  const sendVote = (targetId) => {
    socket.emit("submit-vote", { roomCode: activeCode, targetId }, (res) => {
      if (res && res.success) {
        setMyVote(targetId);
        setNotice('');
      } else {
        setNotice((res && res.message) || "Could not vote.");
      }
    });
  };

  const sendMove = (index) => {
    socket.emit("make-move", { roomCode: activeCode, index }, (res) => {
      if (res && !res.success) {
        setNotice(res.message || "Could not play that move.");
      } else {
        setNotice('');
      }
    });
  };

  const sendClue = (e) => {
    e.preventDefault();
    socket.emit("submit-clue", { roomCode: activeCode, clue: clueText }, (res) => {
      if (res && res.success) {
        setClueText('');
        setNotice('');
      } else {
        setNotice((res && res.message) || "Could not send clue.");
      }
    });
  };

  const sendGuess = (e) => {
    e.preventDefault();
    socket.emit("submit-guess", { roomCode: activeCode, guess: guessText }, (res) => {
      if (res && res.success) {
        setGuessText('');
        setNotice('');
      } else {
        setNotice((res && res.message) || "Could not send guess.");
      }
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(createdCode);
      setNotice('Room code copied!');
    } catch {
      setNotice(`Share this code: ${createdCode}`);
    }
  };

  const chosen = games.find(g => g.id === selectedGame) || games[0];
  const playing = gameData ? (games.find(g => g.id === gameData.game) || games[0]) : null;
  const isHost = Boolean(createdCode);
  const phase = roundState ? roundState.phase : null;
  const myTurn = roundState && roundState.turnId === socket.id;

  const tttStatus = () => {
    if (!roundState) return '';
    if (roundState.phase === 'playing') return myTurn ? 'Your turn!' : `Waiting for ${roundState.turnName}...`;
    if (roundState.winnerName === 'Draw') return "It's a draw!";
    if (roundState.winnerName === 'A player left') return 'The other player left.';
    return `${roundState.winnerName} wins! 🎉`;
  };
  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#home" aria-label="PlayCircle home"><span className="brand-mark"><Gamepad2 size={21}/></span><span>play<span className="brand-accent">circle</span></span></a>
      <button className="mobile-toggle icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Menu/></button>
      <nav className={mobileMenu ? 'nav-links show' : 'nav-links'}>
        <a href="#games" onClick={() => setMobileMenu(false)}>Explore games</a>
        <a href="#how" onClick={() => setMobileMenu(false)}>How to play</a>
        <button className="nav-join" onClick={() => { setModal('join'); setNotice(''); setPlayers([]); setMobileMenu(false); }}>Join a room <ArrowRight size={16}/></button>
      </nav>
    </header>

    <main id="home">
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15}/> GOOD TIMES, ONE ROOM AWAY</div>
          <h1>Bring your people.<br/><span>Let the games begin.</span></h1>
          <p className="hero-text">The easiest way to play together. Create a room, invite your family and friends, and make every get-together a little more fun.</p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => openCreate()}><Plus size={18}/> Create a room</button>
            <button className="btn btn-secondary" onClick={() => { setModal('join'); setNotice(''); setPlayers([]); }}><DoorOpen size={18}/> Join with code</button>
          </div>
          <div className="hero-proof"><span className="avatar-stack"><i>😊</i><i>😎</i><i>🥳</i><i>🤓</i></span><span><b>2–20 players</b> · Fun for everyone</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration of friends playing games">
          <div className="art-sun"></div><div className="float-card float-top"><span>🎉</span><b>Game night!</b></div>
          <div className="people-card"><div className="people-title"><span className="live-dot"></span> YOUR ROOM <span className="room-mini">#PLAY42</span></div><div className="people-grid"><div className="person p1">😄<small>Alex</small></div><div className="person p2">🤩<small>Sam</small></div><div className="person p3">😎<small>Riya</small></div><div className="person p4">🥳<small>You</small></div></div><div className="room-status"><Users size={15}/> 4 friends are ready <span>●</span></div></div>
          <div className="float-card float-bottom"><span>🏆</span><div><b>Good vibes only</b><small>Make memories together</small></div></div>
          <span className="sparkle s1">✦</span><span className="sparkle s2">✳</span>
        </div>
      </section>

      <section className="trust-strip"><div className="wrap trust-inner"><span><ShieldCheck size={17}/> Private rooms for your group</span><span><Users size={17}/> Invite with a simple code</span><span><Clock3 size={17}/> Quick games, easy rules</span></div></section>

      <section className="games-section wrap" id="games">
        <div className="section-heading"><div><div className="eyebrow">PICK YOUR PLAY</div><h2>Find your next favourite</h2><p>Something for every kind of game night.</p></div><a className="text-link" href="#games">Explore all games <ArrowRight size={16}/></a></div>
        <div className="game-grid">{games.map(game => <article className="game-card" key={game.id}>
          <div className={`game-art ${game.color}`}><span className="game-emoji">{game.emoji}</span><span className="game-category">{game.category}</span></div>
          <div className="game-info"><div className="game-title-row"><h3>{game.name}</h3><span className="players"><Users size={13}/>{game.players}</span></div><p>{game.description}</p><div className="game-footer"><span><Clock3 size={13}/>{game.time}</span><button onClick={() => openCreate(game.id)}>Play now <ArrowRight size={15}/></button></div></div>
        </article>)}</div>
      </section>

      <section className="how-section" id="how"><div className="wrap"><div className="section-heading centered"><div className="eyebrow">THREE EASY STEPS</div><h2>Ready, set, together.</h2><p>No complicated setup. Just bring your people.</p></div><div className="steps"><div className="step"><div className="step-icon purple"><Plus/></div><span className="step-number">01</span><h3>Create a room</h3><p>Choose a game and make your own private room.</p></div><div className="step"><div className="step-icon orange"><DoorOpen/></div><span className="step-number">02</span><h3>Invite your people</h3><p>Share the room code so everyone can join in.</p></div><div className="step"><div className="step-icon green"><Crown/></div><span className="step-number">03</span><h3>Play & have fun</h3><p>Get everyone together and let the fun begin.</p></div></div></div></section>

      <section className="bottom-cta wrap"><div><div className="eyebrow">YOUR NEXT GAME NIGHT STARTS HERE</div><h2>More laughs. Less scrolling.</h2><p>Pick a game and bring everyone into the circle.</p></div><button className="btn btn-primary" onClick={() => openCreate()}><Gamepad2 size={18}/> Start playing</button></section>
    </main>

    <footer className="footer"><div className="wrap footer-inner"><a className="brand" href="#home"><span className="brand-mark"><Gamepad2 size={19}/></span><span>play<span className="brand-accent">circle</span></span></a><span>Made for moments together. © 2026 PlayCircle</span><a href="#how">How to play</a></div></footer>

    {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && modal !== 'game') setModal(null); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" style={modal === 'game' ? { maxHeight: '90vh', overflowY: 'auto' } : undefined}>
        {modal !== 'game' && <button className="modal-close icon-button" onClick={() => setModal(null)} aria-label="Close"><X/></button>}

        {modal === 'create' && <>
          <div className="modal-icon">🎮</div>
          <div className="eyebrow">LET'S PLAY</div>
          <h2 id="modal-title">Create your room</h2>
          <p className="modal-sub">Choose a game and invite your crew.</p>
          {!createdCode ? <form onSubmit={createRoom}>
            <label htmlFor="game-select">Choose a game</label>
            <select id="game-select" value={selectedGame} onChange={e => setSelectedGame(e.target.value)}>{games.map(g => <option key={g.id} value={g.id}>{g.name} · {g.players}</option>)}</select>
            {selectedGame === 'charades' && <>
              <label htmlFor="mode-select">Clue type</label>
              <select id="mode-select" value={selectedMode} onChange={e => setSelectedMode(e.target.value)}>
                <option value="text">Text clue (type a clue)</option>
                <option value="draw">Drawing (blank canvas)</option>
              </select>
            </>}
            <label htmlFor="host-name">Your nickname</label>
            <input id="host-name" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. GameMaster" maxLength={18}/>
            {notice && <p className="notice">{notice}</p>}
            <button className="btn btn-primary full" type="submit">Create room <ArrowRight size={17}/></button>
          </form> : <div className="created-room">
            <div className="success-mark"><Check/></div>
            <h3>Your room is ready!</h3>
            <p>{chosen.name} · Share this code with your players.</p>
            <div className="code-box"><strong>{createdCode}</strong><button onClick={copyCode} aria-label="Copy room code"><Copy size={17}/></button></div>
            {notice && <p className="notice">{notice}</p>}
            <div className="player-list">
              <h4>Players ({players.length})</h4>
              {players.map((player, index) => (
                <div className="player-item" key={index}>👤 {pname(player)}</div>
              ))}
            </div>
            <button className="btn btn-primary full" onClick={startGame} disabled={players.length < 2}>Start game <ArrowRight size={17}/></button>
            {players.length < 2 && <p className="small-note">Waiting for at least one more player to join...</p>}
          </div>}
        </>}

        {modal === 'join' && <>
          <div className="modal-icon">🚪</div>
          <div className="eyebrow">YOUR FRIENDS ARE WAITING</div>
          <h2 id="modal-title">Join a room</h2>
          <p className="modal-sub">Enter the room code shared by your host.</p>
          <form onSubmit={joinRoom}>
            <label htmlFor="room-code">Room code</label>
            <input id="room-code" className="code-input" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} placeholder="e.g. PLAY42" autoComplete="off"/>
            <label htmlFor="join-name">Your nickname</label>
            <input id="join-name" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. Riya" maxLength={18}/>
            {notice && <p className="notice">{notice}</p>}
            {players.length > 0 && <div className="player-list">
              <h4>Players ({players.length})</h4>
              {players.map((player, index) => (
                <div className="player-item" key={index}>👤 {pname(player)}</div>
              ))}
            </div>}
            <button className="btn btn-primary full" type="submit">Join room <ArrowRight size={17}/></button>
          </form>
        </>}

        {modal === 'game' && gameData && <>
          <div className="modal-icon">{playing.emoji}</div>
          <div className="eyebrow">{playing.name.toUpperCase()}</div>

          {gameData.game === 'imposter' && <div className="created-room">
            <h2 id="modal-title">Your secret</h2>
            <p className="modal-sub">Category: <b>{gameData.category}</b></p>
            {revealed
              ? <div className="code-box"><strong>{gameData.role === 'imposter' ? '🕵️ You are the IMPOSTER' : gameData.word}</strong></div>
              : <button className="btn btn-primary full" onClick={() => setRevealed(true)}>Tap to reveal</button>}
            {revealed && <button className="btn btn-secondary full" onClick={() => setRevealed(false)}>Hide</button>}
            {revealed && gameData.role === 'imposter' && <p className="small-note">Blend in! Give a hint that fits the category without knowing the word.</p>}

            {notice && <p className="notice">{notice}</p>}

            {phase === 'hints' && <div className="player-list">
              <h4>💬 Hints</h4>
              {roundState.hints.map((h, i) => (
                <div className="player-item" key={i}><b>{h.name}:</b> {h.hint}</div>
              ))}
              {myTurn
                ? <form onSubmit={sendHint}>
                    <label htmlFor="hint-input">Your turn! Give one short hint</label>
                    <input id="hint-input" value={hintText} onChange={e => setHintText(e.target.value)} placeholder="e.g. round" maxLength={40} autoComplete="off"/>
                    <button className="btn btn-primary full" type="submit">Send hint <ArrowRight size={17}/></button>
                  </form>
                : <p className="small-note">Waiting for {roundState.turnName} to give a hint...</p>}
            </div>}

            {phase === 'voting' && <div className="player-list">
              <h4>🗳️ Who is the imposter?</h4>
              {roundState.hints.map((h, i) => (
                <div className="player-item" key={i}><b>{h.name}:</b> {h.hint}</div>
              ))}
              {myVote
                ? <p className="small-note">✅ Vote sent. Waiting for others ({roundState.votedCount}/{roundState.total})</p>
                : roundState.players.filter(p => p.id !== socket.id).map(p => (
                    <button key={p.id} className="btn btn-secondary full" onClick={() => sendVote(p.id)}>Vote {p.name}</button>
                  ))}
            </div>}

            {phase === 'results' && roundState.results && <div className="player-list">
              <h4>{roundState.results.caught ? '🎉 Imposter caught!' : '😈 Imposter escaped!'}</h4>
              <div className="player-item">🕵️ Imposter: <b>{roundState.results.imposterName}</b></div>
              <div className="player-item">🔤 Word: <b>{roundState.results.word}</b></div>
              <h4>This round</h4>
              {roundState.results.deltas.map((d, i) => (
                <div className="player-item" key={i}>{d.name}: {d.delta > 0 ? '+' : ''}{d.delta}</div>
              ))}
            </div>}

            {roundState && <div className="player-list">
              <h4>🏆 Scoreboard</h4>
              {[...roundState.scores].sort((a, b) => b.score - a.score).map((s, i) => (
                <div className="player-item" key={i}>{i + 1}. {s.name} — {s.score}</div>
              ))}
            </div>}

            {phase === 'results' && (isHost
              ? <button className="btn btn-primary full" onClick={startGame}>Next round <ArrowRight size={17}/></button>
              : <p className="small-note">Waiting for the host to start the next round...</p>)}
          </div>}

          {gameData.game === 'tictactoe' && <div className="created-room">
            <h2 id="modal-title">You are {gameData.mark}</h2>
            {roundState && <>
              <p className="modal-sub"><b>{tttStatus()}</b></p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, margin: '12px 0' }}>
                {roundState.board.map((cell, i) => (
                  <button
                    key={i}
                    style={cellStyle}
                    disabled={Boolean(cell) || roundState.phase !== 'playing' || !myTurn}
                    onClick={() => sendMove(i)}
                  >{cell || ''}</button>
                ))}
              </div>
              <div className="player-list">
                <h4>🏆 Scoreboard</h4>
                {[...roundState.scores].sort((a, b) => b.score - a.score).map((s, i) => (
                  <div className="player-item" key={i}>{i + 1}. {s.name} — {s.score}</div>
                ))}
              </div>
            </>}
            {notice && <p className="notice">{notice}</p>}
            {roundState && roundState.phase === 'over' && isHost && <button className="btn btn-primary full" onClick={startGame}>Play again</button>}
          </div>}

          {gameData.game === 'word' && <div className="created-room">
            <h2 id="modal-title">Word Battle</h2>
            {roundState && <>
              {roundState.phase === 'clue' && <>
                {gameData.role === 'giver'
                  ? <>
                      <p className="modal-sub">Your word is <b>{gameData.word}</b> (Category: {gameData.category})</p>
                      <form onSubmit={sendClue}>
                        <label htmlFor="clue-input">Give a short clue (don't say the word)</label>
                        <input id="clue-input" value={clueText} onChange={e => setClueText(e.target.value)} placeholder="e.g. Cheesy, round, hot" maxLength={40} autoComplete="off"/>
                        <button className="btn btn-primary full" type="submit">Send clue <ArrowRight size={17}/></button>
                      </form>
                    </>
                  : <p className="modal-sub">Category: <b>{gameData.category}</b>. Waiting for {roundState.giverName} to give a clue...</p>}
              </>}

              {roundState.phase === 'guess' && <>
                <p className="modal-sub">Clue: <b>{roundState.clue}</b> (Category: {roundState.category})</p>
                {roundState.giverId === socket.id
                  ? <p className="small-note">Waiting for others to guess...</p>
                  : <form onSubmit={sendGuess}>
                      <label htmlFor="guess-input">Your guess</label>
                      <input id="guess-input" value={guessText} onChange={e => setGuessText(e.target.value)} placeholder="Type your guess" maxLength={40} autoComplete="off"/>
                      <button className="btn btn-primary full" type="submit">Send guess <ArrowRight size={17}/></button>
                    </form>}
                <div className="player-list">
                  <h4>Guesses</h4>
                  {roundState.guesses.length === 0 && <div className="player-item">No guesses yet</div>}
                  {roundState.guesses.map((g, i) => (
                    <div className="player-item" key={i}><b>{g.name}:</b> {g.text}</div>
                  ))}
                </div>
              </>}

              {roundState.phase === 'over' && <>
                <p className="modal-sub"><b>{roundState.winnerName ? `${roundState.winnerName} guessed it! 🎉` : ''}</b></p>
                <p className="small-note">The word was <b>{roundState.word}</b>. Clue giver gets +1, correct guesser gets +2.</p>
                {isHost && <button className="btn btn-primary full" onClick={startGame}>Next round <ArrowRight size={17}/></button>}
              </>}

              <div className="player-list">
                <h4>🏆 Scoreboard</h4>
                {[...roundState.scores].sort((a, b) => b.score - a.score).map((s, i) => (
                  <div className="player-item" key={i}>{i + 1}. {s.name} — {s.score}</div>
                ))}
              </div>
            </>}
            {notice && <p className="notice">{notice}</p>}
          </div>}

          {gameData.game === 'charades' && <div className="created-room">
            <h2 id="modal-title">Dumb Charades</h2>
            {roundState && <>
              {roundState.mode === 'draw' && <p className="modal-sub">{gameData.role === 'giver' ? <>Your word is <b>{gameData.word}</b>. Draw it on the canvas!</> : <>Category: <b>{roundState.category}</b>. Guess the drawing!</>}</p>}
              {roundState.mode !== 'draw' && <>
                {roundState.phase === 'clue' && <>
                  {gameData.role === 'giver'
                    ? <>
                        <p className="modal-sub">Your word is <b>{gameData.word}</b> (Category: {gameData.category})</p>
                        <form onSubmit={sendClue}>
                          <label htmlFor="charade-clue">Give a short clue (don't say the word)</label>
                          <input id="charade-clue" value={clueText} onChange={e => setClueText(e.target.value)} placeholder="e.g. Acting, hands moving" maxLength={40} autoComplete="off"/>
                          <button className="btn btn-primary full" type="submit">Send clue <ArrowRight size={17}/></button>
                        </form>
                      </>
                    : <p className="modal-sub">Category: <b>{gameData.category}</b>. Waiting for {roundState.giverName} to give a clue...</p>}
                </>}
                {roundState.phase === 'guess' && <p className="modal-sub">Clue: <b>{roundState.clue}</b> (Category: {roundState.category})</p>}
              </>}

              {roundState.mode === 'draw' && <DrawCanvas enabled={gameData.role === 'giver' && roundState.phase === 'guess'} roomCode={activeCode}/>}

              {roundState.phase === 'guess' && (roundState.mode === 'draw' || roundState.clue) && <>
                {roundState.giverId === socket.id
                  ? <p className="small-note">Waiting for others to guess...</p>
                  : <form onSubmit={sendGuess}>
                      <label htmlFor="charade-guess">Your guess</label>
                      <input id="charade-guess" value={guessText} onChange={e => setGuessText(e.target.value)} placeholder="Type your guess" maxLength={40} autoComplete="off"/>
                      <button className="btn btn-primary full" type="submit">Send guess <ArrowRight size={17}/></button>
                    </form>}
                <div className="player-list">
                  <h4>Guesses</h4>
                  {roundState.guesses.length === 0 && <div className="player-item">No guesses yet</div>}
                  {roundState.guesses.map((g, i) => (
                    <div className="player-item" key={i}><b>{g.name}:</b> {g.text}</div>
                  ))}
                </div>
              </>}

              {roundState.phase === 'over' && <>
                <p className="modal-sub"><b>{roundState.winnerName ? `${roundState.winnerName} guessed it! 🎉` : ''}</b></p>
                <p className="small-note">The word was <b>{roundState.word}</b>. Clue giver gets +1, correct guesser gets +2.</p>
                {isHost && <button className="btn btn-primary full" onClick={startGame}>Next round <ArrowRight size={17}/></button>}
              </>}

              <div className="player-list">
                <h4>🏆 Scoreboard</h4>
                {[...roundState.scores].sort((a, b) => b.score - a.score).map((s, i) => (
                  <div className="player-item" key={i}>{i + 1}. {s.name} — {s.score}</div>
                ))}
              </div>
            </>}
            {notice && <p className="notice">{notice}</p>}
          </div>}

          {gameData.game !== 'imposter' && gameData.game !== 'tictactoe' && gameData.game !== 'word' && gameData.game !== 'charades' && <div className="created-room">
            <h2 id="modal-title">Game started!</h2>
            <p className="modal-sub">{playing.name} is coming soon. The room is working perfectly.</p>
          </div>}

          <button className="btn btn-secondary full" onClick={() => setModal(null)}>Leave game screen</button>
        </>}
      </div>
    </div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
