/* SPB Chess Bot - Game Logic */
'use strict';

let board = null;
let game  = new Chess();

let state = {
  elo:         1200,
  playerColor: 'white',
  active:      false,
  moveHistory: [],
  hintSquare:  null,
};

// ── DOM refs ──────────────────────────────────────────────────────────
const $status      = $('#statusText');
const $moveList    = $('#moveList');
const $eloDisplay  = $('#eloDisplay');
const $ingame      = $('#ingameControls');
const $modal       = $('#modalOverlay');
const $modalTitle  = $('#modalTitle');
const $modalSub    = $('#modalSub');

// ── Highlight helpers ─────────────────────────────────────────────────
function removeHighlights() {
  $('#chessboard .square-55d63').removeClass('highlight-white highlight-black hint-square');
}

function highlightMove(from, to) {
  removeHighlights();
  const colorClass = game.turn() === 'w' ? 'highlight-white' : 'highlight-black';
  $(`#chessboard .square-${from}`).addClass(colorClass);
  $(`#chessboard .square-${to}`).addClass(colorClass);
}

function showHint(square) {
  removeHighlights();
  $(`#chessboard .square-${square}`).addClass('hint-square');
  state.hintSquare = square;
}

// ── Board config ──────────────────────────────────────────────────────
function boardConfig() {
  return {
    draggable:     true,
    position:      'start',
    orientation:   state.playerColor === 'white' ? 'white' : 'black',
    pieceTheme:    'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    onDragStart:   onDragStart,
    onDrop:        onDrop,
    onSnapEnd:     () => board.position(game.fen()),
  };
}

function onDragStart(source, piece) {
  if (!state.active)           return false;
  if (game.game_over())        return false;
  const myColor = state.playerColor === 'white' ? 'w' : 'b';
  if (game.turn() !== myColor) return false;
  if (piece.charAt(0) !== myColor) return false;
  removeHighlights();
  return true;
}

function onDrop(source, target) {
  removeHighlights();
  const move = game.move({ from: source, to: target, promotion: 'q' });
  if (move === null) return 'snapback';

  highlightMove(source, target);
  addMoveToHistory(move.san, game.turn() !== (state.playerColor === 'white' ? 'w' : 'b'));
  updateStatus('thinking');

  if (game.game_over()) {
    handleGameOver();
    return;
  }

  // Send to engine
  fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen: game.fen(), move: source + target, elo: state.elo }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.error) { console.error(data.error); updateStatus('your_turn'); return; }

    game.load(data.fen);
    board.position(data.fen);

    if (data.engine_move) {
      const from = data.engine_move.slice(0, 2);
      const to   = data.engine_move.slice(2, 4);
      highlightMove(from, to);
      // Get SAN for engine move from history
      const hist = game.history();
      addMoveToHistory(hist[hist.length - 1], false);
    }

    if (data.game_over) {
      handleGameOver(data.winner, data.reason);
    } else {
      updateStatus('your_turn');
    }
  })
  .catch(err => { console.error(err); updateStatus('your_turn'); });
}

// ── Status ────────────────────────────────────────────────────────────
function updateStatus(state_name) {
  const map = {
    your_turn: 'Your turn',
    thinking:  '<span class="thinking">Engine thinking...</span>',
    engine:    'Engine\'s turn',
  };
  $status.html(map[state_name] || state_name);
}

// ── Move history ──────────────────────────────────────────────────────
function addMoveToHistory(san, isEngine) {
  state.moveHistory.push({ san, isEngine });
  renderMoveHistory();
}

function renderMoveHistory() {
  if (state.moveHistory.length === 0) {
    $moveList.html('<div class="no-moves">No moves yet</div>');
    return;
  }

  let html = '';
  const moves = state.moveHistory;

  if (state.playerColor === 'white') {
    // White = player, Black = engine - pairs: [player, engine]
    for (let i = 0; i < moves.length; i += 2) {
      const num   = Math.floor(i / 2) + 1;
      const white = moves[i]     ? `<span class="move-white">${moves[i].san}</span>` : '';
      const black = moves[i + 1] ? `<span class="move-black">${moves[i + 1].san}</span>` : '';
      html += `<div class="move-pair"><span class="move-num">${num}.</span>${white}${black}</div>`;
    }
  } else {
    // Black = player, White = engine - first move is engine's
    for (let i = 0; i < moves.length; i += 2) {
      const num   = Math.floor(i / 2) + 1;
      const white = moves[i]     ? `<span class="move-white">${moves[i].san}</span>` : '';
      const black = moves[i + 1] ? `<span class="move-black">${moves[i + 1].san}</span>` : '';
      html += `<div class="move-pair"><span class="move-num">${num}.</span>${white}${black}</div>`;
    }
  }

  $moveList.html(html);
  $moveList[0].scrollTop = $moveList[0].scrollHeight;
}

// ── Game Over ─────────────────────────────────────────────────────────
function handleGameOver(winner, reason) {
  state.active = false;
  let title = 'Game Over';
  let sub   = reason ? `by ${reason}` : '';

  if (winner === 'White') {
    title = state.playerColor === 'white' ? 'You Win' : 'Engine Wins';
  } else if (winner === 'Black') {
    title = state.playerColor === 'black' ? 'You Win' : 'Engine Wins';
  } else {
    title = 'Draw';
  }

  $modalTitle.text(title);
  $modalSub.text(sub);
  $modal.removeClass('hidden');
}

// ── New Game ──────────────────────────────────────────────────────────
function startGame() {
  state.elo         = parseInt($('.elo-btn.active').data('elo'), 10);
  state.playerColor = $('.color-btn.active').data('color');
  state.moveHistory = [];
  state.active      = false;

  renderMoveHistory();
  $modal.addClass('hidden');
  $ingame.removeClass('hidden');
  $eloDisplay.text(`ELO ${state.elo} - Playing as ${state.playerColor}`);
  updateStatus('your_turn');

  board = Chessboard('chessboard', boardConfig());
  game  = new Chess();

  fetch('/api/new_game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ elo: state.elo, color: state.playerColor }),
  })
  .then(r => r.json())
  .then(data => {
    game.load(data.fen);
    board.position(data.fen);
    state.active = true;

    if (data.engine_move) {
      const hist = game.history();
      addMoveToHistory(hist[hist.length - 1], true);
      updateStatus('your_turn');
    }
  });
}

// ── Hint ──────────────────────────────────────────────────────────────
$('#hintBtn').on('click', () => {
  if (!state.active) return;
  fetch('/api/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fen: game.fen() }),
  })
  .then(r => r.json())
  .then(data => {
    if (data.hint) showHint(data.hint.slice(0, 2));
  });
});

// ── Event Listeners ───────────────────────────────────────────────────
$('#eloGrid').on('click', '.elo-btn', function() {
  $('.elo-btn').removeClass('active');
  $(this).addClass('active');
});

$('.color-toggle').on('click', '.color-btn', function() {
  $('.color-btn').removeClass('active');
  $(this).addClass('active');
});

$('#startBtn').on('click', startGame);
$('#newGameBtn').on('click', startGame);
$('#modalNewGame').on('click', startGame);

// ── Init ──────────────────────────────────────────────────────────────
$(function() {
  board = Chessboard('chessboard', {
    position:    'start',
    pieceTheme:  'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    orientation: 'white',
  });
});
