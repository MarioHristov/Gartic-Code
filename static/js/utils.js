//Leave func
function leave(socket, room, userId) {
        socket.emit('leave', {room, user_id: userId});
        socket.disconnect(true);
        navigator.sendBeacon('/clear_session');
}
export function unloadHandler(socket, room, userId){
    // back/forward or reload:
    window.addEventListener('pageshow', event => {
        const [nav] = performance.getEntriesByType('navigation');
        const isReload = nav && nav.type === 'reload';
        const isBackForward = event.persisted || (nav && nav.type === 'back_forward');
        if (isReload || isBackForward) {
            leave(socket, room, userId);
            // send them home
            window.location.href = '/?room_code=' + encodeURIComponent(room);
        }
    });

    // normal unload (close/tab‐switch):
    window.addEventListener('pagehide', event => {
        if (event.persisted) return;   // don’t double‐fire on bfcache
        leave();
    });
}

export function buildPlayerList(data, pList) {
    console.log(data);
    pList.innerHTML = ''
    data.players.forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-slot filled';
        li.dataset.userid = p.user_id;
        li.innerHTML = `
        <img src="/static/${p.avatar}" class="slot-avatar" alt="">
        <span class="slot-name">${p.nickname}</span>`;
        // <span className="points">{{p.points}}</span>
        pList.appendChild(li);
    });
    return pList;
}