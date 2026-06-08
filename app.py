import os
import chess
import chess.engine
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

ENGINE_PATH = os.environ.get("STOCKFISH_PATH", "stockfish")

ELO_LEVELS = {
    800:  {"name": "Beginner",     "desc": "New to chess? Start here."},
    1200: {"name": "Intermediate", "desc": "Casual club-level strength."},
    1600: {"name": "Advanced",     "desc": "Strong tournament player."},
    2000: {"name": "Expert",       "desc": "Near master-level. Good luck."},
}

THINK_TIME = {800: 0.05, 1200: 0.1, 1600: 0.3, 2000: 0.5}


def engine_move(fen: str, elo: int) -> str:
    board = chess.Board(fen)
    with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
        engine.configure({"UCI_LimitStrength": True, "UCI_Elo": elo})
        result = engine.play(board, chess.engine.Limit(time=THINK_TIME.get(elo, 0.1)))
        return result.move.uci()


def board_status(board: chess.Board) -> dict:
    if not board.is_game_over():
        return {"game_over": False}
    result = board.result()
    reason = "checkmate" if board.is_checkmate() else \
             "stalemate" if board.is_stalemate() else \
             "insufficient material" if board.is_insufficient_material() else \
             "repetition" if board.is_repetition() else \
             "fifty-move rule" if board.is_fifty_moves() else "draw"
    winner = None
    if result == "1-0":
        winner = "White"
    elif result == "0-1":
        winner = "Black"
    return {"game_over": True, "result": result, "winner": winner, "reason": reason}


@app.route("/")
def index():
    return render_template("index.html", elo_levels=ELO_LEVELS)


@app.route("/api/new_game", methods=["POST"])
def new_game():
    data = request.get_json(force=True)
    elo = int(data.get("elo", 1200))
    player_color = data.get("color", "white")

    board = chess.Board()
    resp = {"fen": board.fen(), "elo": elo, "player_color": player_color, "game_over": False}

    if player_color == "black":
        move = engine_move(board.fen(), elo)
        board.push(chess.Move.from_uci(move))
        resp["fen"] = board.fen()
        resp["engine_move"] = move

    return jsonify(resp)


@app.route("/api/move", methods=["POST"])
def make_move():
    data = request.get_json(force=True)
    fen = data.get("fen")
    move_uci = data.get("move")
    elo = int(data.get("elo", 1200))

    board = chess.Board(fen)

    try:
        move = chess.Move.from_uci(move_uci)
        # Handle promotion default
        if move not in board.legal_moves:
            move = chess.Move.from_uci(move_uci + "q")
        if move not in board.legal_moves:
            return jsonify({"error": "Illegal move"}), 400
        board.push(move)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    status = board_status(board)
    if status["game_over"]:
        return jsonify({"fen": board.fen(), **status})

    move_str = engine_move(board.fen(), elo)
    board.push(chess.Move.from_uci(move_str))
    status = board_status(board)

    return jsonify({"fen": board.fen(), "engine_move": move_str, **status})


@app.route("/api/hint", methods=["POST"])
def get_hint():
    """Return the best move at full strength — for learning."""
    data = request.get_json(force=True)
    fen = data.get("fen")
    board = chess.Board(fen)
    if board.is_game_over():
        return jsonify({"error": "Game is over"}), 400
    with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
        result = engine.play(board, chess.engine.Limit(time=0.5))
        return jsonify({"hint": result.move.uci()})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5001)
