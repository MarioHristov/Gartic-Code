// static/js/room_setup.js
window._skipLeave = false;
// in your room_setup.js (or before you call io()):

document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-game');
    // ------------------------------------------------------------------
    // 1) Tag‐picker setup
    // ------------------------------------------------------------------
    const TAGS = [
        "ASCII Art", "Algebra", "Algorithms", "Angular", "Arrays", "Artificial Intelligence",
        "Asynchronous", "Backend", "Big Integers", "Binary", "Binary Search Trees",
        "Binary Trees", "Bits", "Cellular Automata", "Ciphers", "Combinatorics", "Compilers",
        "Concurrency", "Cryptography", "Data Frames", "Data Science", "Data Structures",
        "Databases", "Date Time", "Debugging", "Decorator", "Design Patterns",
        "Discrete Mathematics", "Domain Specific Languages", "Dynamic Programming", "Esoteric Languages",
        "Event Handling", "Filtering", "Functional Programming", "Fundamentals", "Game Solvers",
        "Games", "Genetic Algorithms", "Geometry", "Graph Theory", "Graphics", "Graphs", "Heaps",
        "Image Processing", "Interpreters", "Iterators", "JSON", "Language Features", "Linear Algebra",
        "Linked Lists", "Lists", "Logic", "Machine Learning", "Mathematics", "Matrix", "Memoization",
        "Metaprogramming", "Monads", "MongoDB", "Networks", "NumPy", "Number Theory", "Object-oriented Programming",
        "Parsing", "Performance", "Permutations", "Physics", "Priority Queues", "Probability", "Puzzles",
        "Queues", "Recursion", "Refactoring", "Reflection", "Regular Expressions", "Restricted",
        "Reverse Engineering", "Riddles", "Scheduling", "Searching", "Security", "Set Theory", "Sets",
        "Simulation", "Singleton", "Sorting", "Stacks", "State Machines", "Statistics", "Streams",
        "Strings", "Threads", "Trees", "Tutorials", "Unicode", "Web Scraping"
    ]
    const options = document.querySelector(".options-list");
    const selected = document.querySelector(".selected-container");
    const idList = [];


    // render all tag options
    TAGS.forEach(tagName => {
        const li = document.createElement("li");
        li.classList.add("option");
        li.dataset.tagId = tagName.replace(/\W+/g, "_");
        li.textContent = tagName;
        options.appendChild(li);
    });

    // delegate clicks to toggle tag pills
    options.addEventListener("click", e => {
        if (isHost) {
            const li = e.target.closest("li.option");
            if (!li) return;
            const tagId = li.dataset.tagId;
            if (idList.includes(tagId)) {
                removeTag(tagId);
                emitSettingsUpdate();
            } else {
                addTag(li.textContent, tagId);
                emitSettingsUpdate();
            }
        }
    });

    function addTag(text, tagId) {
        idList.push(tagId);
        const pill = document.createElement("div");
        pill.classList.add("tag");
        pill.id = `tag_${tagId}`;
        pill.textContent = text;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.classList.add("remove");
        btn.textContent = "×";
        btn.addEventListener("click", e => {
            e.stopPropagation();
            removeTag(tagId);
            emitSettingsUpdate();         // live‐update tags
        });

        pill.appendChild(btn);
        selected.appendChild(pill);
    }

    function removeTag(tagId) {
        const idx = idList.indexOf(tagId);
        if (idx > -1) idList.splice(idx, 1);
        const pill = document.getElementById(`tag_${tagId}`);
        if (pill) pill.remove();
        emitSettingsUpdate();           // live‐update tags
    }

    // ------------------------------------------------------------------
    // 2) Socket.IO & role logic
    // ------------------------------------------------------------------
    const list = document.querySelector('.player-list');
    list.innerHTML = '';

    window.socket = io();
    const socket = window.socket;
    const room = window.ROOM_CODE;
    let isHost = window.IS_HOST === true;
    const userId = window.USER_ID;

    // on connect: join AND ask for full room state
    socket.on('connect', () => {
        socket.emit('join', {room, user_id: userId});
        socket.emit('request_room_state', {room});
    });

    // full sync: clear & rebuild player list (and settings)
    socket.on('room_state', data => {
        if (data.started) {
            return window.location.href = `/game/${room}`;
        }
        // 1) rebuild players
        list.innerHTML = '';
        data.players.forEach(p => {
            const li = document.createElement('li');
            li.className = 'player-slot filled';
            li.dataset.userid = p.user_id;
            li.innerHTML = `
      <img src="/static/${p.avatar}" class="slot-avatar" alt="">
      <span class="slot-name">${p.nickname}</span>
    `;
            list.appendChild(li);
        });
        // also re-sync settings (if you want)
        if (data.settings) {
            document.getElementById('language').value = data.settings.language;
            document.getElementById('difficulty').value = data.settings.difficulty;
            // wipe tags UI, then re-add tags from data.settings.tags…
            // (you already have code for that under 'settings_updated')
            socket.emit('settings_updated', {
                name: 'tags', value: data.settings.tags
            });
        }
    });
    // handle other players joining
    socket.on('user_joined', data => {
        if (list.querySelector(`[data-userid="${data.user_id}"]`)) return;
        const li = document.createElement('li');
        li.className = 'player-slot filled';
        li.dataset.userid = data.user_id;
        li.innerHTML = `
      <img src="/static/${data.avatar}" class="slot-avatar" alt="">
      <span class="slot-name">${data.nickname}</span>`;
        list.appendChild(li);
    });
    socket.on('user_left', ({user_id}) => {
        const el = list.querySelector(`[data-userid="${user_id}"]`);
        if (el) el.remove();
    });

    // host‐changed: update UI on everyone
    socket.on('host_changed', ({new_host}) => {
        isHost = (new_host === userId);

        // enable/disable settings form
        document.getElementById('settings-fieldset').disabled = !isHost;
        // show/hide Start Game
        console.log(startBtn)
        if (startBtn) startBtn.style.display = isHost ? 'inline-block' : 'none';
    });

    // ------------------------------------------------------------------
    // 3) Live‐update settings (host only)
    // ------------------------------------------------------------------
    function emitSettingsUpdate() {
        if (!isHost) return;
        // collect current settings
        const language = document.getElementById('language').value;
        const difficulty = document.getElementById('difficulty').value;
        const tags = Array.from(idList);

        socket.emit('update_settings', {
            room: room,
            name: 'language',
            value: language
        });
        socket.emit('update_settings', {
            room: room,
            name: 'difficulty',
            value: difficulty
        });
        socket.emit('update_settings', {
            room: room,
            name: 'tags',
            value: tags
        });
    }

    if (isHost) {
        document.getElementById('language').addEventListener('change', emitSettingsUpdate);
        document.getElementById('difficulty').addEventListener('change', emitSettingsUpdate);
        startBtn.style.display = 'inline-block';
        startBtn?.addEventListener('click', () => {
            // prevent our unload-handler from firing
            window._skipLeave = true;

            // tell the server to start
            socket.emit('start_game', {room});

            // everyone listens for game_started and then does the real redirect
            // (or you could do it right here with window.location.href)
        });
    }

// when the server ACKs:
    socket.on('game_started', ({room: r}) => {
        window.location.href = `/game/${r}`;
    });
    // // wire up host controls
    // if (isHost) {
    //     document.getElementById('language').addEventListener('change', emitSettingsUpdate);
    //     document.getElementById('difficulty').addEventListener('change', emitSettingsUpdate);
    //     startBtn.style.display = 'inline-block';
    //     // start game button
    //     document.getElementById('start-game')?.addEventListener('click', () => {
    //         socket.emit('start_game', {room});
    //     });
    // }
    // socket.on('game_started', ({room: r}) => {
    //     window._skipLeave = true;
    //     window.location.href = `/game/${r}`;
    // });

    // apply live updates for all clients
    socket.on('settings_updated', ({name, value}) => {
        if (name === 'language') {
            document.getElementById('language').value = value;
        }
        if (name === 'difficulty') {
            document.getElementById('difficulty').value = value;
        }
        if (name === 'tags') {
            // clear existing pills
            selected.querySelectorAll('.tag').forEach(el => el.remove());
            idList.length = 0;
            // re-add
            value.forEach(tagName => {
                const safeId = tagName.replace(/\W+/g, '_');
                addTag(tagName, safeId);
            });
        }

    });

    // ------------------------------------------------------------------
    // 4) Copy room link
    // ------------------------------------------------------------------
    const copyBtn = document.getElementById('room-code');
    const feedback = document.getElementById('copyFeedback');

    copyBtn.addEventListener('click', async () => {
        const text = window.location.href;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        feedback.textContent = 'Copied!';
        setTimeout(() => feedback.textContent = '', 2000);
    });

function doLeave() {
  if (window._skipLeave) return;
  socket.emit('leave',       { room, user_id: userId });
  socket.disconnect(true);
  navigator.sendBeacon('/clear_session');
}

// back/forward or reload:
window.addEventListener('pageshow', event => {
  const [nav] = performance.getEntriesByType('navigation');
  const isReload      = nav && nav.type === 'reload';
  const isBackForward = event.persisted || (nav && nav.type === 'back_forward');

  if (isReload || isBackForward) {
    doLeave();
    // send them home
    window.location.href = '/?room_code=' + encodeURIComponent(room);
  }
});

// normal unload (close/tab‐switch):
window.addEventListener('pagehide', event => {
  if (event.persisted) return;   // don’t double‐fire on bfcache
  doLeave();
});

// // 6) Bust bfcache/back–forward restores too
//     window.addEventListener('pageshow', event => {
//         // grab the navigation entry
//         const [nav] = performance.getEntriesByType('navigation');
//         const isReload = nav && nav.type === 'reload';
//         const isBackForward = event.persisted || (nav && nav.type === 'back_forward');
//
//         if (isReload || isBackForward) {
//             // fire our leave logic
//             socket.emit('leave', {room, user_id: userId});
//             socket.disconnect(true);
//
//             // tell Flask to clear your session
//             // use Fetch keepalive in case sendBeacon ever flakily arrives late
//             fetch('/clear_session', {method: 'POST', keepalive: true});
//
//             // drop you back to landing with the code pre-filled
//             window.location.href = '/?room_code=' + encodeURIComponent(room);
//         }
//     });
//     window.addEventListener('pagehide', event => {
//         // bfcache restore? don’t fire leave twice
//         if (event.persisted) return;
//
//         // 1) let everyone know you’re gone
//         socket.emit('leave', {room, user_id: userId});
//
//         // 2) tear down your socket immediately
//         socket.disconnect(true);
//
//         // 3) drop your Flask session so the next GET /room_setup sees no creds
//         navigator.sendBeacon('/clear_session');
//     });

});
