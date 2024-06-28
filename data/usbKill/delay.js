
const child_process = require('child_process');


setTimeout(() => {
    child_process.fork(`/home/playerok/playerok/data/usbKill/usbKill.js`)
    // spawn_process('node', [`usbKill.js}`])
}, 4000);