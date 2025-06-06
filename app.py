import uuid
import os
import random
import string
import datetime
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename

# --------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------
LANGUAGES = [
    {'value': 'python', 'name': 'Python'},
    {'value': 'javascript', 'name': 'JavaScript'},
    {'value': 'java', 'name': 'Java'},
    # …add more as desired…
]

TAG_LIST = [
    "ASCII Art", "Algebra", "Algorithms", "Angular", "Arrays",
    # …etc…
]

DIFFICULTIES = [
    {'value': 'easy', 'name': 'Easy'},
    {'value': 'medium', 'name': 'Medium'},
    {'value': 'hard', 'name': 'Hard'}
]

PROMPT_POOL = [
    'Reverse an array', 'Find prime factors', 'Compute Fibonacci',
    # …etc…
]

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}


def create_app():

    App = Flask(__name__, static_folder='static', template_folder='templates')
    App.config['SECRET_KEY'] = 'replace-with-secure-key'
    socket_io = SocketIO(App, async_mode='eventlet')
    # async_mode='eventlet', cors_allowed_origins="*"
    # In‐memory game state
    ROOMS = {}  # code → { created_at, started, players, settings }
    # ROOM_PROMPTS = {}  # code → { nickname: prompt }
    CODE_SUBMISSIONS = {}  # code → { nickname: code_str }
    CLIENTS = {}  # sid → { room, user_id }
    ROOM_PROMPTS = {}
    IN_PLAY = {}
    # ----------------------------------------------------------------
    # Helpers
    # ----------------------------------------------------------------
    def generate_room_code(n=6):
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

    def allowed_file(filename):
        return (
                filename
                and '.' in filename
                and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
        )

    # Preload preset avatars
    AVATAR_DIR = os.path.join(App.static_folder, 'avatars')
    avatars = []
    if os.path.isdir(AVATAR_DIR):
        for fname in os.listdir(AVATAR_DIR):
            if allowed_file(fname):
                avatars.append({'id': fname, 'filename': fname})

    # ----------------------------------------------------------------
    # Routes
    # ----------------------------------------------------------------
    @App.route('/', methods=['GET', 'POST'])
    def landing():
        # allow code prefill via ?room_code=XYZ
        prefill_code = request.args.get('room_code', '')
        if 'user_id' not in session:
            session['user_id'] = str(uuid.uuid4())

        if request.method == 'POST':
            # pick or generate nickname
            nickname = request.form.get('nickname') or f"Player{random.randint(1000, 9999)}"

            # handle avatar upload / preset / random
            file = request.files.get('avatar_upload')
            if file and allowed_file(file.filename):
                fn = secure_filename(file.filename)
                upl_dir = os.path.join(App.static_folder, 'avatars', 'uploads')
                os.makedirs(upl_dir, exist_ok=True)
                file.save(os.path.join(upl_dir, fn))
                avatar = f"avatars/uploads/{fn}"
            elif request.form.get('avatar_preset'):
                avatar = f"avatars/{request.form['avatar_preset']}"
            else:
                choice = random.choice(avatars)
                avatar = f"avatars/{choice['filename']}"

            session['nickname'] = nickname
            session['avatar'] = avatar

            action = request.form.get('action')
            if action == 'create':
                code = generate_room_code()
                ROOMS[code] = {
                    'created_at': datetime.datetime.utcnow(),
                    'started': False,
                    'players': [],
                    'host': str(),
                    'settings': {
                        'language': LANGUAGES[0]['value'],
                        'tags': [],
                        'difficulty': DIFFICULTIES[0]['value']
                    }
                }
                session['room_code'] = code
            else:
                session['room_code'] = request.form.get('room_code')

            return redirect(url_for('room_setup', room_code=session['room_code']))

        return render_template(
            'landing.html',
            avatars=avatars,
            prefill_code=prefill_code
        )

    # noinspection PyTypeChecker,PyUnusedLocal
    @App.route('/room_setup/<room_code>')
    def room_setup(room_code):
        room = ROOMS.get(room_code)
        if not room:
            return 'Invalid or expired room', 404

        # expire by time
        # if datetime.datetime.utcnow() - room['created_at'] > datetime.timedelta(hours=1):
        #     ROOMS.pop(room_code, None)
        #     return 'Room link expired', 410

        # expire once game started
        # noinspection PyTypeChecker
        if room['started']:
            return 'Game already started', 410

        nickname = session.get('nickname')
        avatar = session.get('avatar')
        uid = session.get('user_id')

        if not (nickname and avatar and uid):
            return redirect(url_for('landing', room_code=room_code))

        # figure out if *you* will be host
        is_host = True if not room['players'] or room['players'][0]['user_id'] == uid else False

        return render_template(
            'room_setup.html',
            room_code=room_code,
            players=room['players'],
            avatars=avatars,
            settings=room['settings'],
            languages=LANGUAGES,
            tags=TAG_LIST,
            difficulties=DIFFICULTIES,
            is_host=is_host
        )

    @App.route('/game/<room_code>')
    def game(room_code):
        snapshot = IN_PLAY.get(room_code)
        # 1) room must exist and have been started
        if not snapshot:
            # Nothing in play under that code → bounce back
            return redirect(url_for('landing'))

        # 2) only someone whose user_id is in room['players'] may enter
        uid = session.get('user_id')
        if not uid or uid not in {p['user_id'] for p in snapshot['players']}:
            # send them back (and even prefill the code field if you like)
            return redirect(url_for('landing', room_code=room_code))

        # 3) assign prompts by user_id (not nickname) on first visit
        if room_code not in ROOM_PROMPTS:
            ROOM_PROMPTS[room_code] = {}
            sampled = random.sample(PROMPT_POOL, len(snapshot['players']))
            for p, prompt in zip(snapshot['players'], sampled):
                ROOM_PROMPTS[room_code][p['user_id']] = prompt

        prompt_text = ROOM_PROMPTS[room_code][uid]

        # pull their display name out of the room list

        return render_template(
            'game.html',
            room_code=room_code,
            prompt_text=prompt_text,
            players=snapshot['players'],
            avatars=avatars
        )

    @App.route('/clear_session', methods=['POST'])
    def clear_session():
        # wipe out all lobby‐specific session keys
        for k in ('nickname', 'avatar', 'room_code', 'user_id'):
            session.pop(k, None)
        return '', 204

    # ----------------------------------------------------------------
    # Socket.IO Events
    # ----------------------------------------------------------------
    # noinspection PyTypeChecker
    @socket_io.on('request_room_state')
    def on_request_room_state(data):
        code = data.get('room')
        room = ROOMS.get(code)
        default_settings = {}
        if not room:
            room = IN_PLAY.get(code)
            if not room:
                return;

            prompt_map = ROOM_PROMPTS.get(code, {})

            default_settings = {
                'players': room['players'],
                'settings': room['settings'],
                'promptMap': prompt_map,
                'started': True
            }
        else:
            default_settings = {
                'players': room['players'],
                'settings': room['settings'],
                'started': False
            }

        emit('room_state', default_settings, room=request.sid)

    @socket_io.on('join')
    def on_join(data):
        sid = request.sid
        code = data.get('room')
        uid = data.get('user_id')
        nick = session.get('nickname')
        avatar = session.get('avatar')

        room = ROOMS.get(code)
        if not room:
            return

        if room['started']:
            emit('redirect_to_game', {'room': code}, room=sid)
            return

        # track this socket
        CLIENTS[sid] = {'room': code, 'user_id': uid}

        # only append if they’re not already in players
        entry = {'user_id': uid, 'nickname': nick, 'avatar': avatar}
        if all(p['user_id'] != uid for p in room['players']):
            room['players'].append(entry)

        join_room(code)

        # send the new‐player event to everyone else
        emit('user_joined', entry, room=code, include_self=False)

    # noinspection PyTypeChecker
    @socket_io.on('leave')
    def on_leave(data):
        _sid = request.sid
        code = data.get('room')
        uid = data.get('user_id')
        CLIENTS.pop(_sid, None)
        room = ROOMS.get(code)

        if not room:
            return

        # remove player
        room['players'] = [p for p in room['players'] if p['user_id'] != uid]
        leave_room(code)
        emit('user_left', {'user_id': uid}, room=code)

        # reassign host or expire
        if room['players']:
            new_host = room['players'][0]['user_id']
            emit('host_changed', {'new_host': new_host}, room=code)
        else:
            ROOMS.pop(code, None)

    # noinspection PyTypeChecker
    @socket_io.on('disconnect')
    def on_disconnect():
        sid = request.sid
        client = CLIENTS.pop(sid, None)
        if not client:
            return

        code = client['room']
        uid = client['user_id']
        room = ROOMS.get(code)
        if not room:
            return

        room['players'] = [p for p in room['players'] if p['user_id'] != uid]
        leave_room(code)
        emit('user_left', {'user_id': uid}, room=code)

        if room['players']:
            new_host = room['players'][0]['user_id']
            emit('host_changed', {'new_host': new_host}, room=code)
        else:
            ROOMS.pop(code, None)

    @socket_io.on('start_game')
    def on_start(data):
        code = data.get('room')
        room = ROOMS.get(code)
        if not room:
            return

        room['started'] = True
        IN_PLAY[code] = {
            'players': room['players'],  # deep‐copy of player list
            'settings': room['settings']  # deep‐copy of settings (if you need them in /game)
        }
        emit('game_started', data, room=code)

    @socket_io.on('game_end')
    def on_game_end(data):
        return


    # @socket_io.on('submit_code')
    # def on_submit_code(data):
    #     room_key = data.get('room')
    #     user = data.get('username')
    #     code_str = data.get('code')
    #     CODE_SUBMISSIONS.setdefault(room_key, {})[user] = code_str
    #     emit('code_captured', {'username': user}, room=room_key)

    # @socket_io.on('submit_guess')
    # def on_guess(data):
    #     emit('guess_submitted', data, room=data['room'])

    # noinspection PyTypeChecker
    @socket_io.on('update_settings')
    def on_update_settings(data):
        code = data.get('room')
        name = data.get('name')
        value = data.get('value')
        room = ROOMS.get(code)

        # only the host may broadcast
        if not room or session.get('user_id') != room['players'][0]['user_id']:
            return

        room['settings'][name] = value
        emit('settings_updated', {'name': name, 'value': value}, room=code)

    return App, socket_io

if __name__ == '__main__':
    app, socketio = create_app()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
