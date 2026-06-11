const scribbles = require('scribbles');
let mpvAPI = require('node-mpv');
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const { mqttAuthOpts } = require('/home/playerok/playerok/meta/mqtt_auth.js');
const process = require('process');
const { spawn } = require('child_process');

const file_tools = require("/home/playerok/playerok/meta/tools/file_tools");

const REPO_ROOT = '/home/playerok/playerok'
const DATA_ROOT = path.resolve(REPO_ROOT, 'data')
const PLAYLISTS_ROOT = path.resolve(DATA_ROOT, 'playlists')

// Move mpv IPC socket out of world-writable /tmp into a private per-user dir.
// Prefer XDG_RUNTIME_DIR (e.g. /run/user/1000, mode 700, owned by playerok);
// fall back to a self-created /tmp/playerok-<uid>/ with mode 700.
const _UID = process.getuid ? process.getuid() : 0
let MPV_SOCK_DIR = process.env.XDG_RUNTIME_DIR
if (!MPV_SOCK_DIR) {
  MPV_SOCK_DIR = `/tmp/playerok-${_UID}`
}
try {
  fs.mkdirSync(MPV_SOCK_DIR, { recursive: true, mode: 0o700 })
  fs.chmodSync(MPV_SOCK_DIR, 0o700)
} catch (e) {
  scribbles.warn(`mpv sock dir setup: ${e.message}`)
}
const MPV_SOCK = path.join(MPV_SOCK_DIR, 'playerok-mpv.sock')
// Remove any stale socket file before mpv binds it (would otherwise fail with EADDRINUSE)
try { fs.unlinkSync(MPV_SOCK) } catch {}

// Reject anything that looks like a URL/protocol handler. mpv supports http://,
// https://, rtsp://, rtmp://, ytdl://, lavf://, bd://, dvb://, cdda://,
// script-binding:// etc. — we want only on-disk files under data/.
const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

// Resolve a track path against the repo root; refuse anything that escapes
// data/ or has a URL scheme. Returns absolute path or null.
function safeMediaPath(relOrRepoPath) {
  if (typeof relOrRepoPath !== 'string' || !relOrRepoPath.length) return null
  if (relOrRepoPath.indexOf('\0') !== -1) return null
  if (URL_SCHEME_RE.test(relOrRepoPath)) return null
  let p = relOrRepoPath
  if (p.startsWith('data/')) p = p.slice(5)  // playlists store "data/content/foo.mp4" relative to repo
  const abs = path.resolve(DATA_ROOT, p)
  if (abs !== DATA_ROOT && !abs.startsWith(DATA_ROOT + path.sep)) return null
  return abs
}

function safePlaylistPath(relOrRepoPath) {
  if (typeof relOrRepoPath !== 'string' || !relOrRepoPath.length) return null
  if (relOrRepoPath.indexOf('\0') !== -1) return null
  if (URL_SCHEME_RE.test(relOrRepoPath)) return null
  let p = relOrRepoPath
  if (p.startsWith('data/playlists/')) p = p.slice('data/playlists/'.length)
  else if (p.startsWith('playlists/')) p = p.slice('playlists/'.length)
  const abs = path.resolve(PLAYLISTS_ROOT, p)
  if (!abs.startsWith(PLAYLISTS_ROOT + path.sep)) return null
  return abs
}
//const workerpool = require('workerpool');

var playlist
var current_track_index = 0
var interrupted_track_index = -1
var simple_track_num = 0
var player_state = 'Idle'
var current_volume
var flag_mqtt_ok = 0
var flag_first_run = 1;
var flag_player_started = 0;
let activeNetworkAudioProcesses = [];
let pendingVideoStartTimer = null;
let suppressStoppedOnce = false;  // set before loading new track, cleared in stopped handler
let lastTriggeredTrack = -1;
let lastTriggerTime = 0;

let client
try {
  if (process.stdin && typeof process.stdin.resume === 'function') {
    process.stdin.resume();
  }
} catch (err) {
  scribbles && scribbles.warn ? scribbles.warn(`stdin resume skipped: ${err}`) : null
}

function lastWill(){
  player_state="stop"
  if (pendingVideoStartTimer) {
    clearTimeout(pendingVideoStartTimer)
    pendingVideoStartTimer = null
  }
  stop_network_audio_streams()
  killAudioWorkerSync()
  stop_track(current_track_index)
  mpvPlayer.quit()

  playlist.actions.forEach(action => {
    if (action.event == "stop") {
      try {
        client.publish(action.topic, action.payload, { retain: true })
        scribbles.debug(`publish stop action OK > ${action.topic}:${action.payload}`)
      } catch (err) {
        scribbles.error('publish error' + err)
      }
    }
  })

  scribbles.log('Received SIGTERM. Exit.');
  setTimeout(() => {process.exit()}, 500)
}

process.on('SIGTERM', () => {
  lastWill()
});
process.on('SIGINT', () => {
  lastWill()
});
process.on('SIGQUIT', () => {
  lastWill()
});

try {
  var config = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
  scribbles.config({
    logLevel: config.log.level,
    format: '{time} [{fileName}] <{logLevel}> {message}'
  })
} catch (err) {
  scribbles.error(`Error read file: ${err}`)
  process.exit(1);
}


const mpvPlayer = new mpvAPI({
  "verbose": false,
  "socket": MPV_SOCK,
}, [
  "--fullscreen",
  '--vo=gpu',
  '--hwdec=vaapi',

]);

// mpv creates the UNIX socket itself; we can't make it 0600 atomically, but the
// parent dir is 0700 owned by playerok — that already keeps other LAN/local
// users out. Tighten mode once mpv has bound it.
setTimeout(() => {
  try { fs.chmodSync(MPV_SOCK, 0o600) } catch {}
}, 1000)



function read_playlist(playlistArg) {
  const abs = safePlaylistPath(playlistArg)
  if (!abs) {
    scribbles.error(`Refusing to load playlist outside data/playlists/: ${playlistArg}`)
    process.exit(1)
  }
  try {
    playlist = JSON.parse(fs.readFileSync(abs))
  } catch (err) {
    scribbles.error(`Error read playlist: ${err}`)
    process.exit(1);
  }
  simple_track_num = 0
  playlist.tracks.forEach(item => {
    if (item.type == 'simple') {
      simple_track_num += 1
    }
  })
}

//--------------------Read playlist first----------------------
var args = process.argv.slice(2);
const playlist_path = args[0]
scribbles.log('Playlist argument: ' + playlist_path)
read_playlist(playlist_path)

//--------------------Network audio worker----------------------
let audioWorkerProcess = null
let audioWorkerReady = false
let audioWorkerStdoutBuf = ''
let audioWorkerStderrBuf = ''
const pendingAudioTriggers = new Map()  // key -> trigger_time

function startAudioWorker() {
  try {
    audioWorkerProcess = spawn('python3', ['/home/playerok/playerok/player/audio_worker.py'], { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    scribbles.error(`audio_worker spawn failed: ${err}`)
    return
  }
  audioWorkerProcess.stdout.setEncoding('utf8')
  audioWorkerProcess.stderr.setEncoding('utf8')

  audioWorkerProcess.stdout.on('data', (chunk) => {
    audioWorkerStdoutBuf += chunk
    const lines = audioWorkerStdoutBuf.split('\n')
    audioWorkerStdoutBuf = lines.pop()
    for (const line of lines) {
      if (!line) continue
      try {
        handleAudioWorkerEvent(JSON.parse(line))
      } catch (e) {
        scribbles.warn(`audio_worker invalid event: ${line}`)
      }
    }
  })

  audioWorkerProcess.stderr.on('data', (chunk) => {
    audioWorkerStderrBuf += chunk
    const lines = audioWorkerStderrBuf.split('\n')
    audioWorkerStderrBuf = lines.pop()
    for (const line of lines) {
      if (line.trim()) scribbles.log(`audio_worker: ${line.trim()}`)
    }
  })

  audioWorkerProcess.on('exit', (code, signal) => {
    scribbles.error(`audio_worker exited code=${code} signal=${signal}`)
    audioWorkerProcess = null
    audioWorkerReady = false
  })

  audioWorkerProcess.on('error', (err) => {
    scribbles.error(`audio_worker error: ${err}`)
  })
}

function sendToAudioWorker(cmd) {
  if (!audioWorkerProcess || audioWorkerProcess.killed || !audioWorkerProcess.stdin.writable) {
    scribbles.warn(`audio_worker not available, drop cmd: ${cmd && cmd.cmd}`)
    return
  }
  try {
    audioWorkerProcess.stdin.write(JSON.stringify(cmd) + '\n')
  } catch (err) {
    scribbles.warn(`audio_worker write failed: ${err}`)
  }
}

function killAudioWorkerSync() {
  if (!audioWorkerProcess) return
  const proc = audioWorkerProcess
  audioWorkerProcess = null
  try { if (proc.stdin && proc.stdin.writable) proc.stdin.end() } catch (_) {}
  try { proc.kill('SIGKILL') } catch (_) {}
}

// Synchronous cleanup on ANY exit path (including process.exit(1) from health check)
process.on('exit', () => {
  killAudioWorkerSync()
})

function handleAudioWorkerEvent(ev) {
  const name = ev && ev.event
  if (name === 'ready') {
    audioWorkerReady = true
    scribbles.log('audio_worker ready')
    loadAudioWorkerStreams()
  } else if (name === 'loaded') {
    scribbles.log(`audio_worker loaded keys=${(ev.keys || []).join(',')}`)
  } else if (name === 'playing') {
    scribbles.log(`[audio-trace] key=${ev.key} elapsed=${ev.elapsed_ms}ms`)
  } else if (name === 'eos') {
    scribbles.log(`audio_worker eos key=${ev.key}`)
  } else if (name === 'error') {
    scribbles.warn(`audio_worker error key=${ev.key} err=${ev.error}`)
  } else {
    scribbles.warn(`audio_worker unknown event: ${JSON.stringify(ev)}`)
  }
}

function streamKey(trackIdx, streamIdx) {
  return `t${trackIdx}_s${streamIdx}`
}

// Validators mirror the ones in audio_worker.py; audio_worker is the second
// line of defense. Both must agree because the worker interpolates these into
// a GStreamer parse_launch string.
const _AW_IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/
const _AW_IFACE_RE = /^[A-Za-z0-9._-]{1,15}$/
function _awValidStream(s) {
  if (!_AW_IPV4_RE.test(String(s.multicast_host || ''))) return 'multicast_host not IPv4'
  const port = parseInt(s.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 'port out of range'
  const ttl = Number.isFinite(parseInt(s.ttl)) ? parseInt(s.ttl) : 1
  if (ttl < 1 || ttl > 255) return 'ttl out of range'
  const iface = s.multicast_iface || 'eth0'
  if (!_AW_IFACE_RE.test(iface)) return 'multicast_iface invalid'
  const codec = (s.codec || 'pcm').toLowerCase()
  if (codec !== 'pcm' && codec !== 'opus') return 'codec must be pcm or opus'
  return null
}

function loadAudioWorkerStreams() {
  if (!playlist || !Array.isArray(playlist.tracks)) return
  const cfg = []
  const volume = ((config.sound && typeof config.sound.volume === 'number') ? config.sound.volume : 100) / 100
  for (let ti = 0; ti < playlist.tracks.length; ti++) {
    const track = playlist.tracks[ti]
    const ns = (track.network_audio && Array.isArray(track.network_audio.streams)) ? track.network_audio.streams : []
    for (let si = 0; si < ns.length; si++) {
      const s = ns[si]
      if (s.enabled === false) continue
      if (!s.multicast_host || !s.port) {
        scribbles.warn(`Skip network audio stream with invalid host/port on track ${track.name}`)
        continue
      }
      const reject = _awValidStream(s)
      if (reject) {
        scribbles.warn(`Skip network audio stream on track "${track.name}" stream ${si}: ${reject}`)
        continue
      }
      const requestedAudio = s.audio_path || track.path
      const audio_path = safeMediaPath(requestedAudio)
      if (!audio_path) {
        scribbles.error(`MISSING AUDIO: skip network audio on track "${track.name}" stream ${si}: audio_path outside data/ or URL (${requestedAudio})`)
        continue
      }
      if (!fs.existsSync(audio_path)) {
        scribbles.error(`MISSING AUDIO FILE: track="${track.name}" stream ${si} requested="${requestedAudio}" resolved="${audio_path}" — file does not exist on disk; this stream will be skipped.`)
        continue
      }
      cfg.push({
        key: streamKey(ti, si),
        audio_path,
        multicast_host: s.multicast_host,
        port: parseInt(s.port),
        ttl: Number.isFinite(parseInt(s.ttl)) ? parseInt(s.ttl) : 1,
        multicast_iface: s.multicast_iface || 'eth0',
        codec: (s.codec || 'pcm').toLowerCase(),
        volume,
      })
    }
  }
  scribbles.log(`audio_worker load ${cfg.length} streams`)
  sendToAudioWorker({ cmd: 'load', streams: cfg })
}

startAudioWorker()


//----------------MQTT------------------------------
function mqtt_init() {
  client = mqtt.connect('mqtt://127.0.0.1:1883', mqttAuthOpts())
  client.publish('player/volume_val', `${config.sound.volume}`, { retain: true })


  client.on('connect', function () {
    scribbles.log("mqtt brocker connected!");


    //-------MQTT-------Subscribe playlist topics------------------
    playlist.controls.forEach(control => {
      if (mqtt_sub(control.topic) == true) {
        scribbles.log(`Subscribed control topic: ${control.topic} event: ${control.event}`)
      }
    })

    //--------MQTT------Subscribe tracks topics------------------
    playlist.tracks.forEach(t_track => {
      t_track.triggers.forEach(t_trigger => {
        if (mqtt_sub(t_trigger.topic) == true) {
          scribbles.log(`Subscribed track trigger topic: ${t_trigger.topic} for: ${t_track.name} event: ${t_trigger.event}`)
        }
      })
    })

    //-------MQTT-------Subscribe system topics------------------
    if (mqtt_sub('player/next') === true) {
      scribbles.log(`Subscribed system next topic: player/next`)
    }
    if (mqtt_sub('player/prev') === true) {
      scribbles.log(`Subscribed system prev topic: player/prev`)
    }
    if (mqtt_sub('player/play_pause') === true) {
      scribbles.log(`Subscribed system play_pause topic: player/play_pause`)
    }
    if (mqtt_sub('player/stop') === true) {
      scribbles.log(`Subscribed system stop topic: player/stop`)
    }
    if (mqtt_sub('player/volume_val') === true) {
      scribbles.log(`Subscribed system volume_val topic: volume_val`)
    }


    //-------MQTT-------report playlist start actions------------------
    playlist.actions.forEach(action => {
      if (action.event == "start") {
        try {
          client.publish(action.topic, action.payload, { retain: true })
          scribbles.debug(`publish start action OK > ${action.topic}:${action.payload}`)
        } catch (err) {
          scribbles.error('publish error' + err)
        }
      }
    })



    flag_mqtt_ok = 1

    setTimeout(() => {
      mpvPlayer.getProperty('duration')
      .then(function(duration){
        //console.log("Duration: ", duration);
        if(duration==undefined){
          play_track(current_track_index);
        }
      })
    }, 1500)
    // if (simple_track_num > 0) {
    //   play_track(current_track_index);
    // }
  })

  client.on('message', function (topic, message) {
    scribbles.log(`INCOMING : ${topic}:${message}`)
    
    //--------MQTT------Action on playlist topics------------------
    playlist.controls.forEach(control => {
      if (control.topic == topic) {
        if (control.event == 'next') {
          if (control.payload == message) {
            if (shift_simple_track(+1)) {
              if (play_track(current_track_index)) {
                scribbles.log(`Next track OK command, index: ${current_track_index}`)
              }
            }
          }
        } else if (control.event == 'previous') {
          if (control.payload ==  message) {
            if (shift_simple_track(-1)) {
              if (play_track(current_track_index)) {
                scribbles.log(`Prev track OK command, index: ${current_track_index}`)
              }
            }
          }
        } else if (control.event == 'play/pause') {
          if (control.payload == message) {
            play_pause()
          }
        } else if (control.event == 'set_volume') {
          current_volume = parseInt(message)
          set_volume(current_volume)
        } else if (control.event == 'volume_up') {
          current_volume = current_volume + parseInt(message)
          if (current_volume > 100) { current_volume = 100 }
          set_volume(current_volume)
        } else if (control.event == 'volume_down') {
          current_volume = current_volume - parseInt(message)
          if (current_volume < 0) { current_volume = 0 }
          set_volume(current_volume)
        }
      }
    })


    //--------MQTT------Action on tracks topics------------------
    playlist.tracks.forEach(function (track, t_index) {
      track.triggers.forEach(trigger => {
        if (trigger.topic == topic) {
          if ((trigger.event == 'start') && (trigger.payload ==  parseInt(message))) {
            if (t_index == lastTriggeredTrack && Date.now() - lastTriggerTime < 1000) {
              scribbles.log(`Ignoring duplicate trigger for track ${t_index}`)
              return
            }
            if(current_track_index!=t_index){
              // if(player_state!="Idle"){
              //   stop_track(current_track_index)
              // }
              if(playlist.tracks[current_track_index].type=="simple"){
                interrupted_track_index = current_track_index
              }
              if (play_track(t_index)) {
                lastTriggeredTrack = t_index
                lastTriggerTime = Date.now()
                scribbles.log(`mqtt trigger_on Track OK, current_index: ${current_track_index} -- interupted_index:${interrupted_track_index}`)
              }
            }
          } else if ((trigger.event == 'stop') && (trigger.payload ==  message)) {
            if(current_track_index==t_index){
              if (simple_track_num > 0) {
                  scribbles.log(`mqtt trigger_off return to interrupted_index:${interrupted_track_index}, index: ${current_track_index}`)
                  play_track(interrupted_track_index)
                }else {
                  stop_track()
                }
              }
          }
        }
      })
    })

    //--------MQTT------Action on system topics------------------
    if ((topic == 'player/next') && (message.toString() == 1)) {
      if (shift_simple_track(+1)) {
        if (play_track(current_track_index)) {
          scribbles.log(`Next track OK command, index: ${current_track_index}`)
        }
      }
    }
    if ((topic == 'player/prev') && (message.toString() == 1)) {
      if (shift_simple_track(-1)) {
        if (play_track(current_track_index)) {
          scribbles.log(`Prev track OK command, index: ${current_track_index}`)
        }
      }
    }
    if (topic == 'player/play_pause') {
      if (message == "1") {
        play_pause()
      }
    }
    if (topic == 'player/stop' && (message.toString() == 1)) {
      stop_track(current_track_index)
    }
    if (topic == 'player/volume_val') {
      current_volume = parseInt(message)
      set_volume(current_volume)
      scribbles.log(`Mqtt command, set volume: ${current_volume}`)
    }

  })

}



function mqtt_sub(topic) {
  if (client.subscribe(topic, function (err) {
    if (err) {
      scribbles.error(`subscribe to: ${topic} filed: ${err}`)
      return err
    } else {
      //scribbles.log(`subscribe OK to: ${topic}`)
      return true
    }
  })) {
    return true
  }
}

function report_state(state) {
  if (flag_mqtt_ok == 1) {
    mpvPlayer.getProperty('duration')
    .then(function(duration){
      //console.log(`kuwq ${duration}`);
      mpvPlayer.getProperty('time-pos')
      .then(function(time){
        mpvPlayer.getProperty('filename')
          .then(function(filename){
            //console.log(`${filename}:${time}/${duration}`);
            client.publish('player/state', `${state}:${filename}  ${((time/duration)*100).toFixed(2)}%`)
          })
      })
    })
    
    // if (state == 'Playing') {
    //   client.publish('player/state', `Playing : ${playlist.tracks[current_track_index].name}`, { retain: true })
    // } else if (state == 'Pause') {
    //   client.publish('player/state', `Pause : ${playlist.tracks[current_track_index].name}`, { retain: true })
    // } else if (state == 'Idle') {
    //   client.publish('player/state', `Idle`, { retain: true })
    // }
  }
}

function report_actions(index, event){
  //---report actions---
  playlist.tracks[index].actions.forEach(function (action) {
    if (action.event == event) {
      try {
        client.publish(action.topic, action.payload, { retain: true })
        scribbles.debug(`publish ${event} action OK > ${action.topic}:${action.payload}`)
      } catch (err) {
        scribbles.error('publish error' + err)
      }
    }
  })
}


//-----------------Player--------------------

function set_volume(volume) {
  current_volume = volume
  mpvPlayer.volume(volume)
  sendToAudioWorker({ cmd: 'set_volume', value: Math.max(0, volume) / 100 })

  try {
    var config = JSON.parse(fs.readFileSync('/home/playerok/playerok/meta/player_config.json'))
    config.sound.volume = volume
    fs.writeFileSync('/home/playerok/playerok/meta/player_config.json', JSON.stringify(config, null, 2))
  } catch (err) {
    scribbles.log(`set config fail: ${err}`)
  }
}

function play_track(index) {

  // if ((player_state != 'Idle') && (player_state != 'stop')) {
  //   scribbles.log(`stopped before start< state: ${player_state} `)
  //   stop_track(current_track_index)
  // }

  if ((player_state != 'Idle') && (player_state != 'stop')) {
    report_actions(current_track_index, "stop")
  }

  if (pendingVideoStartTimer) {
    clearTimeout(pendingVideoStartTimer)
    pendingVideoStartTimer = null
  }
  stop_network_audio_streams()
  suppressStoppedOnce = true  // next 'stopped' event is from loading new file, suppress

  //stop_track(current_track_index)
  const track = playlist.tracks[index]
  scribbles.log(`lets play: ${track.name} -- ${track.path}  -- index:${index}`)
  start_network_audio_streams(track)

  const startVideo = () => {
    const mediaAbs = safeMediaPath(track.path)
    if (!mediaAbs) {
      scribbles.error(`MISSING MEDIA: refusing to load path outside data/ (or URL) — track="${track.name}" path="${track.path}"`)
      return false
    }
    if (!fs.existsSync(mediaAbs)) {
      scribbles.error(`MISSING MEDIA FILE: track="${track.name}" path="${track.path}" resolved="${mediaAbs}" — file does not exist on disk. mpv will silently fail to play it.`)
      return false
    }
    try {
      scribbles.log(`mpv load start: ${mediaAbs}`)
      mpvPlayer.load(mediaAbs);
      if(((simple_track_num==1)&&(track.type=="simple"))||(track.repeat==true)){
        scribbles.log(`Loop track`)
        mpvPlayer.loop()
      }else{
        mpvPlayer.clearLoop()
      }
      setTimeout(() => {
        mpvPlayer.getProperty('filename').then((filename) => {
          if (filename === undefined || filename === null) {
            scribbles.error(`mpv DID NOT LOAD file (filename=undefined) — expected="${mediaAbs}" track="${track.name}". mpv is in --really-quiet mode; likely causes: codec/demuxer error, permission denied, corrupted file.`)
          } else {
            scribbles.log(`mpv filename after load: ${filename}`)
          }
        }).catch((err) => {
          scribbles.error(`mpv getProperty(filename) failed: ${err}`)
        })
        mpvPlayer.getProperty('duration').then((duration) => {
          if (duration === undefined || duration === null) {
            scribbles.error(`mpv duration=undefined after loading "${mediaAbs}" — track="${track.name}" likely failed to decode.`)
          } else {
            scribbles.log(`mpv duration after load: ${duration}`)
          }
        }).catch((err) => {
          scribbles.error(`mpv getProperty(duration) failed: ${err}`)
        })
      }, 500)
    } catch (err) {
      scribbles.error(`Play track failed: ${track.name} Error: ${err}`)
      return false
    }
    return true
  }

  const videoDelayMs = (((track.network_audio || {}).video_start_delay_us) || 0)
  if (videoDelayMs > 0) {
    scribbles.log(`Delay video start by ${videoDelayMs} ms`)
    pendingVideoStartTimer = setTimeout(() => {
      pendingVideoStartTimer = null
      startVideo()
    }, videoDelayMs)
  } else {
    startVideo()
  }

  //---report actions---
  report_actions(index, "start")

  current_track_index = index
  setTimeout(() => {
    report_state(player_state = 'Playing')
  }, 10)
  return true
}

function stop_track(index) {
  if (pendingVideoStartTimer) {
    clearTimeout(pendingVideoStartTimer)
    pendingVideoStartTimer = null
  }
  stop_network_audio_streams()

  try {
    //scribbles.debug(`let stop player`)
    mpvPlayer.stop()
  } catch {
    scribbles.error(`Stop track failed: ${playlist.tracks[index].name} Error: ${err}`)
    return false
  }


  //---report actions---
  report_actions(index, "stop")


  //scribbles.log('Stop OK')
  report_state(player_state = 'Idle')
  return true
}

function start_network_audio_streams(track) {
  const networkAudio = track.network_audio || {}
  const streams = Array.isArray(networkAudio.streams) ? networkAudio.streams : []
  if (!streams.length) return

  const trackIdx = playlist.tracks.indexOf(track)
  if (trackIdx < 0) {
    scribbles.warn(`start_network_audio_streams: track ${track.name} not found in playlist`)
    return
  }

  const keys = []
  for (let si = 0; si < streams.length; si++) {
    const s = streams[si]
    if (s.enabled === false) continue
    if (!s.multicast_host || !s.port) continue
    keys.push(streamKey(trackIdx, si))
  }
  if (!keys.length) return

  const trigger_time = Date.now()
  scribbles.log(`audio play track=${track.name} keys=${keys.join(',')}`)
  sendToAudioWorker({ cmd: 'play', keys, trigger_time })
}

function stop_network_audio_streams() {
  if (!audioWorkerProcess) return
  sendToAudioWorker({ cmd: 'stop_all' })
}

function play_pause() {
  if (player_state != "Playing") {
    if (player_state == 'Pause') {
      mpvPlayer.resume()
      report_state(player_state = 'Playing')
    } else if (player_state == 'Idle') {
      play_track(current_track_index)
    }
  } else if (player_state == "Playing") {
    mpvPlayer.pause()
    report_state(player_state = 'Pause')
  }
}

function shift_simple_track(dir) {
  if (simple_track_num > 0) {
    if (dir > 0) {
      current_track_index += 1
      if (current_track_index >= playlist.tracks.length) {
        current_track_index -= playlist.tracks.length
      }
    } else if (dir < 0) {
      current_track_index -= 1
      if (current_track_index < 0) {
        current_track_index += playlist.tracks.length
      }
    }
    if (playlist.tracks[current_track_index].type != 'simple') {
      scribbles.log(`Is not simple truck index ${current_track_index}, skip`)
      shift_simple_track(dir)
    }
    return true
  } else {
    return false
  }

}

mpvPlayer.on('stopped', function () {
  if (flag_first_run == 1) {
    flag_first_run = 0
    scribbles.log(`First run`)
    if (simple_track_num > 0) {
      for (let i = 0; i < playlist.tracks.length; i++) {
        if (playlist.tracks[i].type === 'simple') {
          play_track(i);
          return;
        }
      }
    }
    return
  }

  if(player_state!="Idle"){
    report_actions(current_track_index, "stop")
  }
  scribbles.log(`stopped event. player_state: ${player_state}, index: ${current_track_index}, suppress: ${suppressStoppedOnce}`)
  const _stoppedTrack = playlist && playlist.tracks ? playlist.tracks[current_track_index] : null
  const _stoppedType = _stoppedTrack ? _stoppedTrack.type : 'simple'
  if (_stoppedType !== 'simple') {
    if (interrupted_track_index >= 0 && interrupted_track_index !== current_track_index) {
      const resumeIndex = interrupted_track_index
      interrupted_track_index = -1
      scribbles.log(`stopped event: non-simple track ended, resuming interrupted loop track ${resumeIndex}`)
      play_track(resumeIndex)
    } else {
      scribbles.log(`stopped event: non-simple track type=${_stoppedType}, skipping auto-advance`)
    }
    return
  }
  if (suppressStoppedOnce) {
    suppressStoppedOnce = false
    scribbles.log(`stopped event: suppressed (track switch in progress)`)
    return
  }
  if (simple_track_num > 0 && player_state !== 'stop') {
    if (shift_simple_track(+1)) {
      if (play_track(current_track_index)) {
        scribbles.log(`Prev track End, play Next track OK, index: ${current_track_index}`)
      }
    }
  }

});

mpvPlayer.on('statuschange', function(status){
  scribbles.debug(`mpv statuschange: ${JSON.stringify(status)}`);
});

setTimeout(() => {
  mpvPlayer.stop()
}, 500);

setTimeout(() => {
  mqtt_init()
}, 1000);

setInterval(() => {
  report_state(player_state)

}, 1000);

// ===================== mpv health check =====================
const MPV_HEALTH_CHECK_INTERVAL_MS = 30000
const MPV_HEALTH_TIMEOUT_MS = 5000
const MPV_HEALTH_GRACE_MS = 30000
const MPV_HEALTH_SUMMARY_MS = 300000
const MPV_HEALTH_FAIL_THRESHOLD = 2
const playerStartedAt = Date.now()
let mpvConsecutiveFails = 0
let lastMpvHealthSummary = 0

function timeoutPromise(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${label} ${ms}ms`)), ms))
  ])
}

async function checkMpvHealth() {
  if (Date.now() - playerStartedAt < MPV_HEALTH_GRACE_MS) return

  try {
    const probeAll = (async () => {
      const vo = await mpvPlayer.getProperty('vo-configured').catch(() => null)
      const idle = await mpvPlayer.getProperty('idle-active').catch(() => null)
      const filename = await mpvPlayer.getProperty('filename').catch(() => null)
      const timePos = await mpvPlayer.getProperty('time-pos').catch(() => null)
      return { vo, idle, filename, timePos }
    })()
    const r = await timeoutPromise(probeAll, MPV_HEALTH_TIMEOUT_MS, 'mpv probe')

    const summary = `vo=${r.vo} idle=${r.idle} pos=${r.timePos} file=${r.filename} idx=${current_track_index} state=${player_state}`
    const broken =
      r.vo === false ||
      (r.idle === true && current_track_index >= 0 && player_state === 'Playing')

    if (broken) {
      mpvConsecutiveFails += 1
      scribbles.warn(`[health] mpv unhealthy (${mpvConsecutiveFails}/${MPV_HEALTH_FAIL_THRESHOLD}) | ${summary}`)
      if (mpvConsecutiveFails >= MPV_HEALTH_FAIL_THRESHOLD) {
        scribbles.error(`[health] mpv unrecoverable, exiting for scheduler respawn | ${summary}`)
        setTimeout(() => process.exit(1), 200)
      }
    } else {
      mpvConsecutiveFails = 0
      if (Date.now() - lastMpvHealthSummary > MPV_HEALTH_SUMMARY_MS) {
        scribbles.log(`[health] OK | ${summary}`)
        lastMpvHealthSummary = Date.now()
      }
    }
  } catch (err) {
    mpvConsecutiveFails += 1
    scribbles.warn(`[health] mpv probe failed (${mpvConsecutiveFails}/${MPV_HEALTH_FAIL_THRESHOLD}): ${err}`)
    if (mpvConsecutiveFails >= MPV_HEALTH_FAIL_THRESHOLD) {
      scribbles.error(`[health] mpv probe unrecoverable, exiting for scheduler respawn`)
      setTimeout(() => process.exit(1), 200)
    }
  }
}

setInterval(() => { checkMpvHealth().catch(e => scribbles.error(`[health] interval error: ${e}`)) }, MPV_HEALTH_CHECK_INTERVAL_MS)
