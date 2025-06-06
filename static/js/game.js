// static/js/game.js
import {unloadHandler, buildPlayerList} from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const room = window.ROOM_CODE;
    const userId = window.USER_ID;

    // DOM elements
    let playerList = document.querySelector('.player-list');
    const timerDisplay = document.getElementById('timer-countdown');
    const promptTextEl = document.getElementById('prompt-text');
    const codeInputEl = document.getElementById('code-input');
    const submitBtn = document.getElementById('submit-code-btn');
    const feedbackEl = document.getElementById('submission-feedback');

    let countdownInterval = null;

    // ----------------------------------------------------------------
    // 1) When socket connects: join room + request full room_state
    // ----------------------------------------------------------------
    socket.on('connect', () => {
        socket.emit('join', {room, user_id: userId});
        socket.emit('request_room_state', {room});
    });

    socket.on('redirect_to_game', ({room: r}) => {
        if (r === room) {
            window.location.href = `/game/${r}`;
        }
    });
    socket.on('room_state', data => {
        // If game wasn't started yet (but the template loaded), this is first sync:
        if (!data.started) {
            return window.location.href = '/?room_code=' + encodeURIComponent(room);
        }
        playerList = buildPlayerList(data, playerList);

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        startCountdown(600); // 600 seconds
    });

    // ----------------------------------------------------------------
    // 3) Incremental updates: user_joined & user_left
    // ----------------------------------------------------------------

    socket.on('user_joined', playerObj => {
        // Append that one player (unless already present)
        if (!playerListEl.querySelector(`[data-userid="${playerObj.user_id}"]`)) return;
          const li = document.createElement('li');
              li.className = 'player-slot filled';
              li.dataset.userid = playerObj.user_id;
              li.innerHTML = `
          <img src="/static/${playerObj.avatar}" class="slot-avatar" alt="Avatar of ${playerObj.nickname}">
          <span class="slot-name">${playerObj.nickname}</span>
        `;
              playerListEl.appendChild(li);

    });

    socket.on('user_left', ({user_id}) => {
        const goneEl = playerListEl.querySelector(`[data-userid="${user_id}"]`);
        if (goneEl) goneEl.remove();
    });

    // ----------------------------------------------------------------
    // 4) When the host finally clicks “Start Game”, server does:
    //    emit('game_started', { room }, room=code)
    // ----------------------------------------------------------------

    socket.on('game_started', ({room: r}) => {
        // If for some reason we receive “game_started” here (e.g. late),
        // reload so the browser GETs /game/<code> and our Flask handler
        // ensures we only stay if room['started']==True and user_id matches.
        if (r !== room) return;
        window.location.href = `/game/${r}`;
    });

    // ----------------------------------------------------------------
    // 5) Countdown logic
    // ----------------------------------------------------------------

    function startCountdown(totalSeconds) {
        let timeLeft = totalSeconds;

        // Immediately display initial time
        timerDisplay.textContent = formatTime(timeLeft);

        countdownInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft < 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                timerDisplay.textContent = "00:00";
                return;
            }
            timerDisplay.textContent = formatTime(timeLeft);
        }, 1000);
    }

    function formatTime(secs) {
        const min = Math.floor(secs / 60);
        const sec = secs % 60;
        return `${min < 10 ? '0' + min : min}:${sec < 10 ? '0' + sec : sec}`;
    }

    // ----------------------------------------------------------------
    // 6) Submit code logic
    // ----------------------------------------------------------------

    submitBtn.addEventListener('click', () => {
        const codeStr = codeInputEl.value.trim();
        if (!codeStr) {
            feedbackEl.textContent = "Cannot submit an empty solution.";
            return;
        }
        // disable the button to prevent double‐submits
        submitBtn.disabled = true;
        feedbackEl.textContent = "Submitting…";

        // send “submit_code” to server. You can decide payload shape.
        socket.emit('submit_code', {
            room: room,
            username: userId,   // server‐side is mapping by user_id
            code: codeStr
        });

        // When server acknowledges by sending back “code_captured”:
        socket.once('code_captured', ({username}) => {
            if (username === userId) {
                feedbackEl.style.color = 'green';
                feedbackEl.textContent = "Your code was received!";
            }
        });
    });

    // ----------------------------------------------------------------
    // 7) Clean‐up on reload / close / back–forward
    // ----------------------------------------------------------------

    let hasLeft = false;

    function doUnload() {
        if (hasLeft) return;
        hasLeft = true;
        unloadHandler(socket, room, userId);
    }

    window.addEventListener('pageshow', event => {
        const [nav] = performance.getEntriesByType('navigation');
        const isReload = nav && nav.type === 'reload';
        const isBackForward = event.persisted || (nav && nav.type === 'back_forward');
        if (isReload || isBackForward) {
            doUnload();
            window.location.href = '/?room_code=' + encodeURIComponent(room);
        }
    });

    window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        doUnload();
    });

});
