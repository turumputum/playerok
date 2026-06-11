#!/usr/bin/env node

/* jshint esversion: 6 */
/* jshint node: true */
"use strict";

const helperFuncs = require('./assets/helperFuncs');
const scribbles = require('scribbles');

const express = require("express");
const session = require("express-session");
const basicAuth = require('express-basic-auth')
const fileUpload = require('express-fileupload');
const flash = require("connect-flash");
var xrandrParse = require('xrandr-parse');
//const assets = require("./assets");
const archiver = require("archiver");
const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");
var Netmask = require('netmask').Netmask

const { exec, execSync, spawn } = require('child_process');
const fastFolderSizeSync = require('fast-folder-size/sync')

const file_tools = require("../meta/tools/file_tools");

var bodyParser = require('body-parser');

async function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        scribbles.warn(error)
      }
      //scribbles.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout ? stdout : stderr);
    })
  })
}



const port = 80
const app = express();
// var server = https.createServer(options, app).listen(port, function(){
//   scribbles.log("Express server listening on port " + port);
// });
const http = app.listen(port);

app.set("views", path.join(__dirname, "views"));
// '/meta' and '/logs' are no longer served statically — they contain secrets (wifi/admin passwords).
// Use /save_config / /get_logs / /api/logs/:filename instead; these go through redactSecrets().
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')))
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')))
app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist')))
app.use('/bootstrap5-toggle', express.static(path.join(__dirname, 'node_modules/bootstrap5-toggle')))
app.use('/treeview', express.static(path.join(__dirname, 'bower_components/bootstrap-treeview/src/js')))
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')))
app.use('/bootstrap-icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons')))
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/icons", express.static(path.join(__dirname, "views/icons")));
app.use("/data", express.static(path.join(__dirname, "data")));
app.use("/docs", express.static(path.join(__dirname, "docs")));
app.set('view engine', 'pug')

var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
const shellable = false;
const cmdable = false;
if (config.security.auth == 1) {
  app.use(basicAuth({
    users: { [config.security.admin_login]: config.security.admin_pass },
    challenge: true
  }))

  app.get('/logout', function (req, res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401)
    //return res.redirect('/');
  });
}

scribbles.config({
  logLevel: config.log.level,
  format: '{time} [{fileName}] <{logLevel}> {message}'
})


// requireCsrfToken / /reboot / /power_off are defined further down, AFTER the
// session+csrfToken middleware is mounted — otherwise req.session would be
// undefined when those handlers run and every POST would return 403.




//----------------CONFIG------------------------------

// Load (or create on first start) a per-device session secret. Stored at
// meta/.session_key with mode 0600. Setting SESSION_KEY in the environment
// overrides the file (useful for tests).
function loadOrCreateSessionSecret() {
  const SESSION_KEY_PATH = '/home/playerok/playerok/meta/.session_key'
  try {
    const existing = fs.readFileSync(SESSION_KEY_PATH, 'utf8').trim()
    if (existing.length >= 32) return existing
    scribbles.warn(`session_key file too short, regenerating`)
  } catch (e) {
    // doesn't exist or unreadable — fall through to generate
  }
  const fresh = require('crypto').randomBytes(64).toString('hex')
  try {
    fs.writeFileSync(SESSION_KEY_PATH, fresh, { mode: 0o600 })
    scribbles.log(`Generated new session secret at ${SESSION_KEY_PATH}`)
  } catch (e) {
    scribbles.error(`Failed to persist session secret (${e.message}); using in-memory secret — sessions will not survive restart`)
  }
  return fresh
}

app.use(
  session({
    secret: process.env.SESSION_KEY || loadOrCreateSessionSecret(),
    resave: false,
    saveUninitialized: true,  // need session created on first GET so we can stash csrfToken
  })
);

// Per-session CSRF token. Required by POST /reboot, /power_off (and any
// future state-changing endpoint that calls requireCsrfToken). The token is
// exposed to Pug templates as `csrfToken` for inlining into a <meta> tag.
const _crypto = require('crypto')
app.use((req, res, next) => {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = _crypto.randomBytes(32).toString('hex')
  }
  res.locals.csrfToken = (req.session && req.session.csrfToken) || ''
  next()
})

// /reboot and /power_off are dangerous state-changing actions:
//   1. moved from GET to POST (a stray <img src=...> can no longer trigger them)
//   2. require a session-bound CSRF token header (X-CSRF-Token)
// Mounted here, AFTER session+csrfToken middleware, so req.session is populated.
function requireCsrfToken(req, res) {
  const expected = req.session && req.session.csrfToken
  const got = req.headers['x-csrf-token']
  if (!expected || !got || expected !== got) {
    scribbles.warn(`CSRF token missing/mismatch on ${req.method} ${req.path} (expected=${expected ? 'set' : 'missing'}, got=${got ? 'set' : 'missing'})`)
    res.status(403).json({ error: 'csrf_token_invalid' })
    return false
  }
  return true
}

app.post('/reboot', function (req, res) {
  if (!requireCsrfToken(req, res)) return
  scribbles.log("time to reboot")
  execPromise('sudo reboot now')
  return res.json({ ok: true })
});

app.post('/power_off', function (req, res) {
  if (!requireCsrfToken(req, res)) return
  scribbles.log("time to power off")
  execPromise('sudo poweroff')
  return res.json({ ok: true })
});

app.use(flash());
app.use(fileUpload());
app.use(
  bodyParser.urlencoded({
    extended: false,
    limit: '10mb',
  })
);
// Drop __proto__/constructor keys at parse time so a JSON body cannot pollute
// Object.prototype (sanitizing later via Object.keys is too late — those keys
// land on the prototype chain, not as own enumerable properties).
app.use(bodyParser.json({
  limit: '10mb',
  reviver: (key, value) => (key === '__proto__' || key === 'constructor') ? undefined : value
}));


// Recursively strip __proto__ keys so saved JSON, when re-parsed by consumers,
// cannot pollute Object.prototype. We don't drop 'constructor'/'prototype' —
// those are legitimate field names a future schema might use.
function sanitizeJsonObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sanitizeJsonObject)
  const out = {}
  for (const k of Object.keys(obj)) {
    if (k === '__proto__') continue
    out[k] = sanitizeJsonObject(obj[k])
  }
  return out
}

// Write JSON to disk atomically: stage in a sibling tmp file, then rename.
// Crash mid-write leaves the existing file intact. webka runs as root but
// every consumer (scheduler, player.js) runs as playerok; if we left the
// file root-owned with mode 0600 they'd get EACCES on the next read. So:
//   - default mode 0644 (these tables/playlists are not secrets);
//   - pass { mode: 0o600 } explicitly for files holding secrets (player_config.json);
//   - when running as root, inherit the directory's uid/gid so the file
//     belongs to playerok regardless of who wrote it.
function atomicWriteJsonSync(filePath, data, options = {}) {
  const dir = path.dirname(filePath)
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}`)
  const payload = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  const mode = typeof options.mode === 'number' ? options.mode : 0o644
  fs.writeFileSync(tmp, payload, { mode })
  fs.renameSync(tmp, filePath)
  try {
    if (typeof process.geteuid === 'function' && process.geteuid() === 0) {
      const st = fs.statSync(dir)
      fs.chownSync(filePath, st.uid, st.gid)
      fs.chmodSync(filePath, mode)
    }
  } catch (e) {
    scribbles.warn(`atomicWriteJsonSync chown/chmod fallback failed for ${filePath}: ${e}`)
  }
}

// Minimal shape checks — reject obviously broken structures so subscripts
// (set_net_config, set_security_config, ...) don't crash on missing fields.
// Each returns null on success, or { error, message } on failure.
function validateConfigShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { error: 'invalid_config', message: 'config must be a JSON object' }
  }
  const requiredSections = ['net', 'sound', 'screen', 'security', 'log', 'time']
  for (const k of requiredSections) {
    if (obj[k] != null && (typeof obj[k] !== 'object' || Array.isArray(obj[k]))) {
      return { error: 'invalid_config', message: `config.${k} must be an object` }
    }
  }
  return null
}

function validateSchedulerTable(arr) {
  if (!Array.isArray(arr)) {
    return { error: 'invalid_scheduler_table', message: 'scheduler table must be an array' }
  }
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i]
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      return { error: 'invalid_scheduler_table', message: `task[${i}] must be an object` }
    }
    // task_name and task_path/path are the fields scheduler/player read; keep loose
    if (t.task_name != null && typeof t.task_name !== 'string') {
      return { error: 'invalid_scheduler_table', message: `task[${i}].task_name must be a string` }
    }
    if (t.task_path != null && typeof t.task_path !== 'string') {
      return { error: 'invalid_scheduler_table', message: `task[${i}].task_path must be a string` }
    }
    if (t.path != null && typeof t.path !== 'string') {
      return { error: 'invalid_scheduler_table', message: `task[${i}].path must be a string` }
    }
  }
  return null
}

function validatePlaylistShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { error: 'invalid_playlist', message: 'playlist must be an object' }
  }
  if (obj.playlist_name != null && typeof obj.playlist_name !== 'string') {
    return { error: 'invalid_playlist', message: 'playlist.playlist_name must be a string' }
  }
  if (obj.tracks != null) {
    if (!Array.isArray(obj.tracks)) {
      return { error: 'invalid_playlist', message: 'playlist.tracks must be an array' }
    }
    for (let i = 0; i < obj.tracks.length; i++) {
      if (!obj.tracks[i] || typeof obj.tracks[i] !== 'object') {
        return { error: 'invalid_playlist', message: `playlist.tracks[${i}] must be an object` }
      }
    }
  }
  return null
}

function redactSecrets(text) {
  if (text == null) return ''
  if (typeof text !== 'string') text = String(text)
  return text
    .replace(/"(password|admin_pass|psk|secret|token|api_key|wifi_password|wlan_password)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
    .replace(/wifi-sec\.psk\s+\S+/gi, 'wifi-sec.psk [REDACTED]')
    .replace(/yes\s+\S+\s*\|\s*passwd/gi, 'yes [REDACTED] | passwd')
    .replace(/\bpassword\s*=\s*\S+/gi, 'password=[REDACTED]')
    .replace(/\bpsk\s*=\s*\S+/gi, 'psk=[REDACTED]')
}

function getSecurityWarnings() {
  const warnings = []
  let cfg = null
  try { cfg = JSON.parse(fs.readFileSync('../meta/player_config.json')) } catch {}

  if (!cfg || !cfg.security || cfg.security.auth != 1) {
    warnings.push({
      id: 'auth_disabled',
      level: 'danger',
      title: 'Аутентификация выключена',
      message: 'Веб-интерфейс открыт без логина — любой хост в локальной сети может управлять устройством, менять конфигурацию и удалять файлы. Включите в Settings → Security.'
    })
  }
  if (cfg && cfg.security && (cfg.security.admin_pass === 'playerok' || !cfg.security.admin_pass)) {
    warnings.push({
      id: 'default_password',
      level: 'warning',
      title: 'Пароль admin не изменён',
      message: 'Используется пароль по умолчанию. Смените в Settings → Security.'
    })
  }

  let mqttHasAuth = false
  try {
    const confs = ['/etc/mosquitto/mosquitto.conf']
    try {
      for (const f of fs.readdirSync('/etc/mosquitto/conf.d')) {
        if (f.endsWith('.conf')) confs.push('/etc/mosquitto/conf.d/' + f)
      }
    } catch {}
    for (const p of confs) {
      try {
        const txt = fs.readFileSync(p, 'utf8')
        if (/^\s*password_file\s/m.test(txt) || /^\s*allow_anonymous\s+false/m.test(txt)) {
          mqttHasAuth = true
          break
        }
      } catch {}
    }
  } catch {}
  if (!mqttHasAuth) {
    warnings.push({
      id: 'mqtt_no_auth',
      level: 'warning',
      title: 'MQTT-брокер без пароля',
      message: 'Mosquitto принимает анонимные подключения. Желательно ограничить брокер локальным интерфейсом и добавить пароль.'
    })
  }
  return warnings
}

app.use((req, res, next) => {
  res.locals.security_warnings = getSecurityWarnings()
  next()
})


function relative(...paths) {

  var finalPath = paths.reduce((a, b) => path.join(a, b), process.cwd());

  // if (path.relative(process.cwd(), finalPath).startsWith("..")) {
  //   throw new Error("Failed to resolve path outside of the working directory");
  // }
  return finalPath;
}

// Path containment helpers: every file-touching endpoint must use these to
// reject ../ traversal, absolute paths escaping data/, and symlink-style tricks.
const DATA_ROOT = path.resolve(__dirname, '..', 'data')
const PLAYLISTS_ROOT = path.resolve(DATA_ROOT, 'playlists')

function safeDataPath(...segments) {
  const cleaned = segments
    .filter(s => s != null)
    .map(s => String(s).replace(/^\/+/, ''))  // strip leading '/' so resolve treats every segment as relative to DATA_ROOT
  if (cleaned.some(s => s.indexOf('\0') !== -1)) return null
  const joined = path.resolve(DATA_ROOT, ...cleaned)
  if (joined !== DATA_ROOT && !joined.startsWith(DATA_ROOT + path.sep)) return null
  return joined
}

function safePlaylistPath(userPath) {
  if (typeof userPath !== 'string' || !userPath.length) return null
  let s = userPath.replace(/^\.{1,2}\//, '')
  if (s.startsWith('data/')) s = s.slice(5)
  if (s.startsWith('playlists/')) s = s.slice('playlists/'.length)
  if (s.indexOf('\0') !== -1) return null
  const joined = path.resolve(PLAYLISTS_ROOT, s)
  if (!joined.startsWith(PLAYLISTS_ROOT + path.sep)) return null
  return joined
}
function flashify(req, obj) {
  let error = req.flash("error");
  if (error && error.length > 0) {
    if (!obj.errors) {
      obj.errors = [];
    }
    obj.errors.push(error);
  }
  let success = req.flash("success");
  if (success && success.length > 0) {
    if (!obj.successes) {
      obj.successes = [];
    }
    obj.successes.push(success);
  }
  obj.isloginenabled = 0;
  return obj;
}

app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  let sourceHost = null;
  try {
    if (req.headers.origin) {
      sourceHost = new URL(req.headers.origin).host;
    } else if (req.headers.referer) {
      sourceHost = new URL(req.headers.referer).host;
    }
  } catch (e) {
    sourceHost = null
  }
  if (sourceHost !== null && sourceHost !== req.headers.host) {
    // Origin/Referer present but cross-origin — reject with 403 instead of
    // throwing (which used to escape async stacks and crash the request).
    scribbles.warn(`CSRF: Origin/Referer ${sourceHost} != Host ${req.headers.host}`)
    return res.status(403).json({ error: 'csrf_origin_mismatch' })
  }
  // sourceHost === null (no Origin/Referer): allow — many CLI clients (curl,
  // node scripts) don't send these. Endpoints that need stricter protection
  // require an explicit CSRF token via requireCsrfToken().
  next();
});


app.all("/data*", (req, res, next) => {

  const sub = req.params[0] || ''
  const safe = safeDataPath(sub)
  if (!safe) {
    scribbles.warn(`data path rejected — escapes data root: ${sub}`)
    res.stats = { error: new Error('invalid_path') }
    res.filename = '../data' + sub
    res.absPath = null
    return next()
  }
  res.filename = '../data' + sub;  // preserve old format for UI breadcrumb
  res.absPath = safe;               // absolute, safe path for fs ops

  let fileExists = new Promise((resolve, reject) => {
    fs.stat(safe, (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve(stats);
    });
  });

  fileExists
    .then((stats) => {
      res.stats = stats;
      next();
    })
    .catch((err) => {
      res.stats = { error: err };
      next();
    });
});

app.post("/data/*@move", (req, res) => {
  const move_data = req.body
  scribbles.log("Move request body: " + JSON.stringify(move_data))

  if (!move_data.new_path_val || typeof move_data.new_path_val !== 'string' || move_data.new_path_val.length === 0) {
    scribbles.warn("Invalid destination path for move: " + JSON.stringify(move_data))
    req.flash("error", "No destination folder selected.");
    return res.redirect("back");
  }

  const sub = req.params[0] || ''
  const sourceBase = safeDataPath(sub)
  const destBase = safeDataPath(move_data.new_path_val)
  if (!sourceBase || !destBase) {
    scribbles.warn(`move rejected — invalid path sub=${sub} dest=${move_data.new_path_val}`)
    req.flash("error", "Invalid path.")
    return res.redirect("back")
  }

  let files_to_move = (Array.isArray(move_data.file_names) && move_data.file_names.length > 0)
    ? move_data.file_names
    : [move_data.file_name]
  files_to_move = files_to_move.filter(f => typeof f === 'string' && f.length > 0)
  if (files_to_move.length === 0) {
    scribbles.warn("No valid files passed to move")
    req.flash("error", "No files selected for move.");
    return res.redirect("back");
  }

  let movePairs
  try {
    movePairs = files_to_move.map(f => {
      const src = safeDataPath(sub, f)
      const dst = safeDataPath(move_data.new_path_val, f)
      if (!src || !dst) throw new Error(`invalid_path:${f}`)
      return { name: f, src, dst }
    })
  } catch (e) {
    scribbles.warn(`move rejected — ${e.message}`)
    req.flash("error", "Invalid file name.")
    return res.redirect("back")
  }

  scribbles.log("lets move: " + JSON.stringify(files_to_move) + " from " + sourceBase + "  to  " + destBase)

  new Promise((resolve, reject) => {
    fs.access(sourceBase, fs.constants.W_OK, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  })
    .then(() => {
      let move_promises = movePairs.map(({ src, dst }) => {
        return new Promise((resolve, reject) => {
          fs.rename(src, dst, (err) => {
            if (err) {
              return reject(err);
            }
            resolve();
          });
        });
      })

      Promise.all(move_promises)
        .then(() => {
          scribbles.log("move ok")
          req.flash("success", `${files_to_move.length} file(s) moved successfully.`);
          res.redirect("back");
        })
        .catch((err) => {
          scribbles.warn(err);
          req.flash("error", "Unable to move some files: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      scribbles.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});


app.post('/data/*@upload', function (req, res) {
  // req.params[0] is automatically URL-decoded by Express (so spaces in filenames
  // arrive as spaces, not %20). Avoid req.url because that's still percent-encoded.
  const sub = req.params[0] || ''
  const base_is_directory = sub.endsWith('/') || sub.length === 0

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  const uploaded_files = Array.isArray(req.files.file) ? req.files.file : [req.files.file]

  const upload_promises = uploaded_files.map((uploaded_file) => {
    return new Promise((resolve, reject) => {
      let upload_path
      if (uploaded_files.length > 1 || base_is_directory) {
        upload_path = safeDataPath(sub, uploaded_file.name)
      } else {
        upload_path = safeDataPath(sub)
      }
      if (!upload_path) {
        scribbles.warn(`Upload rejected — path escapes data root: sub=${sub} name=${uploaded_file.name}`)
        return reject(new Error('invalid_path'))
      }
      uploaded_file.mv(upload_path, function (err) {
        if (err) {
          scribbles.warn(`Upload error: ${err} path: ${upload_path}`)
          return reject(err)
        }
        resolve()
      });
    })
  })

  Promise.all(upload_promises)
    .then(() => {
      res.send('complete').end();
    })
    .catch((err) => {
      if (err && err.message === 'invalid_path') return res.status(400).send('invalid path')
      return res.status(500).send(String(err))
    })


});

app.post("/data/*@mkdir", (req, res) => {
  const sub = req.params[0] || ''
  let folder = (req.body && req.body.folder_name) || ''

  if (!folder || folder.length < 1) {
    return res.status(400).end();
  }

  const target = safeDataPath(sub, folder)
  if (!target) {
    scribbles.warn(`mkdir rejected — escapes data root: sub=${sub} folder=${folder}`)
    req.flash("error", "Invalid folder path.")
    return res.redirect("back")
  }
  scribbles.log("lets make directory " + target)

  fs.stat(target, (statErr, stats) => {
    if (!statErr) {
      scribbles.log("Folder exists, cannot overwrite. ")
      req.flash("error", "Folder exists, cannot overwrite. ");
      return res.redirect("back");
    }
    fs.mkdir(target, (err) => {
      if (err) {
        scribbles.warn(err);
        req.flash("error", err.toString());
        return res.redirect("back");
      }
      req.flash("success", "Folder created. ");
      res.redirect("back");
    });
  });
});

app.post("/data/*@delete", (req, res) => {
  const delete_data = req.body
  const sub = req.params[0] || ''
  let del_files = (Array.isArray(delete_data.del_names_val) && delete_data.del_names_val.length > 0)
    ? delete_data.del_names_val
    : [delete_data.del_name_val]
  del_files = del_files.filter(f => typeof f === 'string' && f.length > 0)
  if (del_files.length === 0) {
    scribbles.warn("No valid files passed to delete")
    req.flash("error", "No files selected.");
    return res.redirect("back");
  }

  let resolved
  try {
    resolved = del_files.map(f => {
      const p = safeDataPath(sub, f)
      if (!p) throw new Error(`invalid_path:${f}`)
      return { name: f, path: p }
    })
  } catch (e) {
    scribbles.warn(`delete rejected — ${e.message}`)
    req.flash("error", "Invalid file path.")
    return res.redirect("back")
  }
  scribbles.log("delete sub=" + sub + " files=" + JSON.stringify(del_files))

  let promises = resolved.map((f) => {
    return new Promise((resolve, reject) => {
      fs.stat(f.path, (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve({
          name: f.name,
          path: f.path,
          isdirectory: stats.isDirectory(),
          isfile: stats.isFile(),
        });
      });
    });
  });
  Promise.all(promises)
    .then((files) => {
      let promises = files.map((f) => {
        return new Promise((resolve, reject) => {
          let op = null;
          if (f.isdirectory) {
            op = (dir, cb) =>
              rimraf(
                dir,
                {
                  glob: false,
                },
                cb
              );
          } else if (f.isfile) {
            op = fs.unlink;
          }
          if (op) {
            op(f.path, (err) => {
              if (err) {
                scribbles.log("del failed");
                return reject(err);
              }
              resolve();
            });
          }
        });
      });
      Promise.all(promises)
        .then(() => {
          scribbles.log("success", "Files deleted. ");
          req.flash("success", "Files deleted. ");
          res.redirect("back");
        })
        .catch((err) => {
          scribbles.warn(err);
          req.flash("error", "Unable to delete some files: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      scribbles.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.get("/data/*@download", (req, res) => {
  const sub = req.params[0] || ''

  let files = null;
  try {
    files = JSON.parse(req.query.files);
  } catch (e) { }
  if (!files || !files.map) {
    req.flash("error", "No files selected.");
    res.redirect("back");
    return;
  }

  let resolved
  try {
    resolved = files.map(f => {
      const p = safeDataPath(sub, f)
      if (!p) throw new Error(`invalid_path:${f}`)
      return { name: f, path: p }
    })
  } catch (e) {
    scribbles.warn(`download rejected — ${e.message}`)
    return res.status(400).send('invalid path')
  }

  let promises = resolved.map((f) => {
    return new Promise((resolve, reject) => {
      fs.lstat(f.path, (err, stats) => {
        if (err) {
          return reject(err);
        }
        if (stats.isSymbolicLink()) {
          return reject(new Error(`symlink_refused:${f.name}`));
        }
        resolve({
          name: f.name,
          path: f.path,
          isdirectory: stats.isDirectory(),
          isfile: stats.isFile(),
        });
      });
    });
  });
  Promise.all(promises)
    .then((files) => {
      let zip = archiver("zip", {});
      zip.on("error", function (err) {
        scribbles.warn(err);
        res.status(500).send({
          error: err.message,
        });
      });

      files
        .filter((f) => f.isfile)
        .forEach((f) => {
          zip.file(f.path, { name: f.name });
        });
      files
        .filter((f) => f.isdirectory)
        .forEach((f) => {
          zip.directory(f.path, f.name);
        });

      res.attachment("Archive.zip");
      zip.pipe(res);

      zip.finalize();
    })
    .catch((err) => {
      scribbles.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.post("/data/*@rename", (req, res) => {
  const rename_data = req.body || {}
  const sub = req.params[0] || ''
  scribbles.log("lets rename: " + rename_data.old_name_val + "  to  " + rename_data.new_name_val)

  const base = safeDataPath(sub)
  const oldPath = safeDataPath(sub, rename_data.old_name_val)
  const newPath = safeDataPath(sub, rename_data.new_name_val)
  if (!base || !oldPath || !newPath) {
    scribbles.warn(`rename rejected — invalid path sub=${sub}`)
    req.flash("error", "Invalid file path.")
    return res.redirect("back")
  }

  new Promise((resolve, reject) => {
    fs.access(base, fs.constants.W_OK, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  })
    .then(() => {
      new Promise((resolve, reject) => {
        fs.rename(oldPath, newPath, (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      })
        .then(() => {
          scribbles.log("rename ok")
          req.flash("success", "Files renamed. ");
          res.redirect("back");
        })
        .catch((err) => {
          scribbles.warn(err);
          req.flash("error", "Unable to rename some files: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      scribbles.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.post("/data/*@edit", (req, res) => {
  try {
    const content = typeof req.body.content === 'string' ? req.body.content : ''
    const fullPath = safeDataPath(req.params[0])
    if (!fullPath) {
      scribbles.warn(`edit rejected — invalid path: ${req.params[0]}`)
      return res.status(400).send('Invalid file path')
    }
    fs.writeFile(fullPath, content, 'utf8', (err) => {
      if (err) {
        scribbles.warn('Edit file error: ' + err)
        return res.status(500).send(err.toString())
      }
      res.send({ ok: true })
    })
  } catch (err) {
    scribbles.warn('Edit file parse error: ' + err)
    res.status(500).send(err.toString())
  }
});

app.post("/edit_file", (req, res) => {
  try {
    const body = req.body
    const relativePath = typeof body.path === 'string' ? body.path : ''
    const content = typeof body.content === 'string' ? body.content : ''
    const fullPath = safeDataPath(relativePath)
    if (!fullPath) {
      scribbles.warn(`edit_file rejected — invalid path: ${relativePath}`)
      return res.status(400).send('Invalid file path')
    }
    fs.writeFile(fullPath, content, 'utf8', (err) => {
      if (err) {
        scribbles.warn('Edit file error: ' + err)
        return res.status(500).send(err.toString())
      }
      res.send({ ok: true })
    })
  } catch (err) {
    scribbles.warn('Edit file parse error: ' + err)
    res.status(500).send(err.toString())
  }
});

app.get("/", (req, res) => {
  let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  res.render("home", {
    pageName: "home",
    config: config
  });
});

//----------------SCHEDULER------------------------------

app.get("/Scheduler", (req, res) => {
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);
  //scribbles.log(JSON.stringify(tasks,null,2))
  rawdata = fs.readFileSync('../meta/playlist-table.json');
  let playlist_table = JSON.parse(rawdata);
  //scribbles.log(JSON.stringify(playlist_table,null,2))
  //
  tasks.forEach(task => {
    
    if(!fs.existsSync('/home/playerok/playerok/'+task.task_path)){
      task.state ='File not found'
    }
  });


  res.render("scheduler", {
    pageName: "Scheduler",
    tasks: tasks,
    playlist_table: playlist_table,
    config: config
  });
});

app.post("/Scheduler/delete", (req, res) => {
  scribbles.log("DELETE REQUEST RECEIVED: " + redactSecrets(JSON.stringify(req.body)))
  const task_to_delete = req.body
  scribbles.log('task index to delete ' + task_to_delete.index_to_delete)
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);
  
  let index = tasks.findIndex(element => element.task_name == task_to_delete.name_to_delete)
  //scribbles.log(`name to delete:${task_to_delete.name_to_delete} index:${index}`)
  tasks.splice(index, 1)
  //scribbles.log(tasks)
  atomicWriteJsonSync('../meta/scheduler-table.json', tasks)

  return res.end('done')
});

app.post("/Scheduler/edit", (req, res) => {
  const task_to_edit = req.body
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  scribbles.log("Change index " + (task_to_edit.index - 1) + " edit from " + tasks[(task_to_edit.index - 1)].name + " to " + task_to_edit.name)

  tasks[(task_to_edit.index - 1)].name = task_to_edit.name
  tasks[(task_to_edit.index - 1)].path = task_to_edit.path
  tasks[(task_to_edit.index - 1)].type = task_to_edit.type
  tasks[(task_to_edit.index - 1)].start_time = task_to_edit.start_time
  tasks[(task_to_edit.index - 1)].end_time = task_to_edit.end_time
  tasks[(task_to_edit.index - 1)].day_of_week = task_to_edit.day_of_week

  let data = JSON.stringify(tasks, null, 2)
  atomicWriteJsonSync('../meta/scheduler-table.json', data)

  return res.end('done')
});

app.post("/Scheduler/new", (req, res) => {
  const new_task = req.body
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  tasks.push(new_task)

  let data = JSON.stringify(tasks, null, 2)
  atomicWriteJsonSync('../meta/scheduler-table.json', data)

  return res.end('done')
});

app.post("/save_scheduler_table", (req, res) => {
  const sanitized = sanitizeJsonObject(req.body)
  const err = validateSchedulerTable(sanitized)
  if (err) {
    scribbles.warn(`save_scheduler_table rejected: ${err.message}`)
    return res.status(400).json(err)
  }
  try {
    atomicWriteJsonSync('../meta/scheduler-table.json', sanitized)
    scribbles.log(`scheduler-table save OK`)
  } catch (err) {
    scribbles.warn(`Write scheduler-table error: ${err}`)
    return res.status(500).json({ error: 'write_failed', message: err.message })
  }

  return res.end('done')
});


//----------------FILE MANAGER------------------------------
app.get("/data*", (req, res) => {
  if (res.stats.error) {
    scribbles.log("Error : " + res.stats.error);
    res.render(
      "list",
      flashify(req, {
        shellable: shellable,
        cmdable: cmdable,
        path: res.filename,
        errors: [res.stats.error],
      })
    );
  } else if (res.stats.isDirectory()) {

    if (!req.url.endsWith("/")) {
      return res.redirect(req.url + "/");
    }

    let readDir = new Promise((resolve, reject) => {
      fs.readdir(res.absPath, (err, filenames) => {
        if (err) {
          return reject(err);
        }
        return resolve(filenames);
      });
    });

    readDir
      .then((filenames) => {
        const promises = filenames.map(
          (f) =>
            new Promise((resolve, reject) => {
              const childAbs = path.join(res.absPath, f)
              fs.stat(childAbs, (err, stats) => {
                if (err) {
                  scribbles.warn(err);
                  return resolve({
                    name: f,
                    error: err,
                  });
                }
                let type = file_tools.check_type(f, stats)
                let size = (type == 'dir') ? (fastFolderSizeSync(childAbs)) : stats.size
                //scribbles.log(`For:${res.filename+f} type:${type} size:${size}`)
                resolve({
                  name: f,
                  type: type,
                  //issmallimage: isimage(f) && stats.size < SMALL_IMAGE_MAX_SIZE,
                  size: size,
                });
              });
            })
        );

        Promise.all(promises)
          .then((files) => {
            files.sort(function (a, b) {
              //if (a.isdirectory != b.isdirectory) {        // Is one a folder and
              if ((a.type == 'dir') != (b.type == 'dir')) {        // Is one a folder and
                return ((a.type == 'dir') ? -1 : 1);       //  the other a file?
              }                                      // If not, compare the
              return a.name.localeCompare(b.name);   //  the names.
            });
            res.render(
              "list",
              flashify(req, {
                path: res.filename,
                files: files,
                pageName: "FileManager",
                dirs: res.filename.split('/'),
                dDirs: file_tools.scanDirs('../data'),
                config: config
              })
            );
            //scribbles.log('render list')
          })
          .catch((err) => {
            scribbles.error(err);
            res.render(
              "list",
              flashify(req, {
                shellable: shellable,
                cmdable: cmdable,
                path: res.filename,
                errors: [err],
              })
            );
          });
      })
      .catch((err) => {
        scribbles.warn(err);
        res.render(
          "list",
          flashify(req, {
            shellable: shellable,
            cmdable: cmdable,
            path: res.filename,
            errors: [err],
          })
        );
      });
  } else if (res.stats.isFile()) {
    res.sendFile(res.absPath, {
      headers: {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'none'; sandbox",
      },
      dotfiles: "allow",
    });
  }
});



//----------------PLAY_LIST_EDITOR------------------------------
app.get("/Editor", (req, res) => {
  let playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))
  let content_table = JSON.parse(fs.readFileSync('../meta/content-table.json'))
  //
  res.render("editor", {
    pageName: 'Editor',
    playlist_table: playlist_table,
    content_table: content_table,
    config: config
  });
});

app.get("/get_playlist*", (req, res) => {
  const raw = req.url.split('?').slice(-1)[0]
  let decoded
  try { decoded = decodeURIComponent(raw) } catch { decoded = raw }
  const playlistPath = safePlaylistPath(decoded)
  if (!playlistPath) {
    scribbles.warn(`get_playlist rejected — invalid path: ${decoded}`)
    return res.status(400).json({ error: 'invalid_playlist_path' })
  }
  try {
    let playlist = JSON.parse(fs.readFileSync(playlistPath))
    let content_table = JSON.parse(fs.readFileSync('../meta/content-table.json'))
    res.send({
      playlist: playlist,
      content_table: content_table
    })
  } catch (err) {
    scribbles.warn(`get_playlist read error: ${err}`)
    return res.status(404).json({ error: 'not_found' })
  }
});

function validatePlaylistMulticastCollisions(playlist) {
  const seen = new Map()
  if (!playlist || !Array.isArray(playlist.tracks)) return null
  for (let ti = 0; ti < playlist.tracks.length; ti++) {
    const t = playlist.tracks[ti]
    const ns = (t.network_audio && Array.isArray(t.network_audio.streams)) ? t.network_audio.streams : []
    for (let si = 0; si < ns.length; si++) {
      const s = ns[si]
      if (s.enabled === false) continue
      if (!s.multicast_host || !s.port) continue
      const key = `${s.multicast_host}:${s.port}`
      const prev = seen.get(key)
      if (prev) {
        return {
          conflict: key,
          first: { track_index: prev.ti, track_name: prev.tn, stream_index: prev.si, stream_name: prev.sn },
          second: { track_index: ti, track_name: t.name, stream_index: si, stream_name: s.name }
        }
      }
      seen.set(key, { ti, tn: t.name, si, sn: s.name })
    }
  }
  return null
}

app.post("/save_playlist*", (req, res) => {
  const inData = sanitizeJsonObject(req.body || {})
  const playlist = inData.playlist

  let targetPath = safePlaylistPath(inData.path)
  if (!targetPath) {
    scribbles.warn(`save_playlist rejected — invalid path: ${inData.path}`)
    return res.status(400).json({ error: 'invalid_playlist_path' })
  }

  const shapeErr = validatePlaylistShape(playlist)
  if (shapeErr) {
    scribbles.warn(`save_playlist rejected: ${shapeErr.message}`)
    return res.status(400).json(shapeErr)
  }

  // also validate the new name (used to rename file below) — must not contain path separators
  if (typeof playlist.playlist_name !== 'string' || !playlist.playlist_name.length ||
      /[\/\\\0]/.test(playlist.playlist_name) || playlist.playlist_name.startsWith('.')) {
    scribbles.warn(`save_playlist rejected — invalid playlist_name: ${playlist.playlist_name}`)
    return res.status(400).json({ error: 'invalid_playlist_name' })
  }

  const collision = validatePlaylistMulticastCollisions(playlist)
  if (collision) {
    const msg = `Multicast collision on ${collision.conflict}: track "${collision.first.track_name}" stream "${collision.first.stream_name}" vs track "${collision.second.track_name}" stream "${collision.second.stream_name}"`
    scribbles.warn(`save_playlist rejected: ${msg}`)
    return res.status(400).json({ error: 'multicast_collision', message: msg, detail: collision })
  }

  let scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
  let playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))
  let playlistIndex = playlist_table.findIndex(s => s.path == inData.path)
  if (playlistIndex < 0) {
    scribbles.log("Add new playlist name: " + playlist.playlist_name)
    playlist_table.push({
      name: playlist.playlist_name,
      path: inData.path,
      type: 'multimedia'
    })
    playlistIndex = playlist_table.length - 1
  } else {

    if (inData.path.split('/').slice(-1) != playlist.playlist_name) {
      if (fs.existsSync(targetPath)) {
        fs.unlink(targetPath, (err => {
          if (err) scribbles.log(err);
        }))
      }

      const new_path = 'data/playlists/' + playlist.playlist_name + ".json"
      scheduler_table.forEach(item => {
        if (item.path == playlist_table[playlistIndex].path) {
          item.path = new_path
        }
      })

      playlist_table[playlistIndex].path = new_path
      playlist_table[playlistIndex].name = playlist.playlist_name
      const renamed = safePlaylistPath(new_path)
      if (!renamed) {
        scribbles.warn(`save_playlist rename rejected — invalid new_path: ${new_path}`)
        return res.status(400).json({ error: 'invalid_playlist_path' })
      }
      targetPath = renamed
      scribbles.log(`rename playlist name OK`)
    }
  }

  atomicWriteJsonSync('../meta/scheduler-table.json', scheduler_table)
  atomicWriteJsonSync('../meta/playlist-table.json', playlist_table)

  atomicWriteJsonSync(targetPath, playlist)

  return res.end('done')
});

app.post("/delete_playlist*", (req, res) => {
  const inData = req.body || {}

  scribbles.log(`Delete name: ${inData.name_to_delete} on index: ${inData.index_to_delete}`)

  let playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))

  const idx = parseInt(inData.index_to_delete, 10) - 1
  if (!Number.isInteger(idx) || idx < 0 || idx >= playlist_table.length) {
    scribbles.warn(`delete_playlist rejected — out of range index: ${inData.index_to_delete}`)
    return res.status(400).json({ error: 'invalid_index' })
  }

  const entryPath = playlist_table[idx] && playlist_table[idx].path
  const targetPath = safePlaylistPath(entryPath)
  if (!targetPath) {
    scribbles.warn(`delete_playlist rejected — invalid stored path: ${entryPath}`)
    return res.status(400).json({ error: 'invalid_playlist_path' })
  }

  let scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
  scheduler_table = scheduler_table.filter(task => task.path != entryPath)
  atomicWriteJsonSync('../meta/scheduler-table.json', scheduler_table)

  playlist_table.splice(idx, 1)
  atomicWriteJsonSync('../meta/playlist-table.json', playlist_table)

  scribbles.log("Delete PLAYLIST: " + JSON.stringify(inData, null, 2) + " path: " + targetPath)
  if (fs.existsSync(targetPath)) {
    fs.unlink(targetPath, (err => {
      if (err) scribbles.log(err);
      else {
        scribbles.log("Deleted OK");
      }
    }))
  }

  return res.end('done')
});


//----------------SETTINGS------------------------------
app.get("/Settings", (req, res) => {
  let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))


  Promise.all([
    execPromise(`ip -j a`),
    execPromise(`ip -j r`),
    // execPromise(`nmcli device show eth0 | grep IP4.DNS`),
    // execPromise(`nmcli device show eth1 | grep IP4.DNS`),
    // execPromise(`nmcli device show wlan0 | grep IP4.DNS`),
    execPromise(`sudo -u playerok xrandr -display :0.0`)

  ]).then(responses => {
    let netAddrs = JSON.parse(responses[0])
    let netRoutes = JSON.parse(responses[1])
    let screen_dev_list = xrandrParse(responses[2])
    const ifMass = ['eth0', 'eth1', 'wlan0'];

    // Pre-initialize every interface so the settings template always sees a
    // defined net_info[iface]. A missing wlan0 (no Wi-Fi hardware, or radio
    // fully down so it never appears in `ip a`) used to leave net_info.wlan0
    // undefined and crash the client-side Wi-Fi indicator.
    let net_info = {};
    for (const iface of ifMass) {
      net_info[iface] = { carrier: 0, IP: '', net_mask: '', gateway: '', DNS: '' }
    }

    // Signal strength (0-100) of the currently-associated Wi-Fi AP, or 0 when
    // not connected. Must not throw: the previous `nmcli ... | grep yes` made
    // execSync raise (grep exit 1) whenever no Wi-Fi was active, which aborted
    // the whole net_info build for wlan0.
    const wifiSignal = () => {
      try {
        const out = execSync(`nmcli -t -f ACTIVE,SIGNAL dev wifi`).toString()
        for (const line of out.split('\n')) {
          const [active, signal] = line.split(':')
          if (active === 'yes') return parseInt(signal) || 0
        }
      } catch (e) { /* no radio / no scan results */ }
      return 0
    }

    for (let dev of netAddrs) {
      for (let iface of ifMass) {
        try {
          if (dev.ifname == iface) {
            if (iface == 'eth0' || iface == 'eth1') {
              net_info[iface]["carrier"] = parseInt(execSync(`head /sys/class/net/${iface}/carrier`).toString()) || 0
            } else {
              net_info[iface]["carrier"] = (dev.operstate == 'UP') ? wifiSignal() : 0
            }

            if (dev.operstate == 'UP' && dev.addr_info && dev.addr_info[0]) {
              net_info[iface]["IP"] = dev.addr_info[0].local
              let block = new Netmask(`${dev.addr_info[0].local}/${dev.addr_info[0].prefixlen}`)
              net_info[iface]['net_mask'] = block.mask
              for (let route of netRoutes) {
                if (route.dev == iface) {
                  net_info[iface]['gateway'] = route.gateway
                  break
                }
              }
              if (config.net[iface].DHCP == 1) {
                try {
                  net_info[iface]['DNS'] = execSync(`nmcli device show ${iface} | grep IP4.DNS`).toString().split(":")[1].replace(/ /g, '').replace("\n", '')
                } catch (e) {
                  net_info[iface]['DNS'] = config.net[iface].DNS
                }
              } else {
                net_info[iface]['DNS'] = config.net[iface].DNS
              }
            } else if (config.net[iface].DHCP == 0) {
              net_info[iface]["IP"] = config.net[iface].IP
              net_info[iface]['net_mask'] = config.net[iface].net_mask
              net_info[iface]['gateway'] = config.net[iface].gateway
              net_info[iface]['DNS'] = config.net[iface].DNS
            }
          }
        } catch (err) {
          scribbles.warn(`Net info ${iface} error:${err}`)
        }
      }
    }
    //console.log(net_info)

    res.render("settings", {
      pageName: 'Settings',
      config: config,
      net_info: net_info,
      screen_dev_list: screen_dev_list,

    })
  })



})

app.post("/save_config", (req, res) => {
  const sanitized = sanitizeJsonObject(req.body || {})

  const shapeErr = validateConfigShape(sanitized)
  if (shapeErr) {
    scribbles.warn(`save_config rejected: ${shapeErr.message}`)
    return res.status(400).json(shapeErr)
  }

  const newName = sanitized && sanitized.net && sanitized.net.mDNS_name
  if (newName !== undefined) {
    if (typeof newName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(newName)) {
      scribbles.warn(`save_config rejected: invalid mDNS_name ${JSON.stringify(newName)}`)
      return res.status(400).json({
        error: 'invalid_mdns_name',
        message: 'Device name must be 1-63 chars, lowercase letters/digits/hyphens, start with letter or digit'
      })
    }
  }

  try {
    atomicWriteJsonSync('../meta/player_config.json', sanitized, { mode: 0o600 })
    scribbles.log(`Config save OK`)
  } catch (err) {
    scribbles.warn(`Write config error: ${err}`)
    return res.status(500).json({ error: 'write_failed', message: err.message })
  }

  return res.end('done')
});


//----------------System------------------------------
app.get("/get_time", (req, res) => {
  let date_ob = new Date();

  res.send({
    h: date_ob.getHours(),
    m: date_ob.getMinutes()
  })
});

app.get("/get_date", (req, res) => {
  let date_ob = new Date();
  //scribbles.log(`Current date: ${date_ob.getFullYear()} - ${date_ob.getMonth()} - ${date_ob.getDate()}`)

  res.send({
    d: date_ob.getDate(),
    m: (date_ob.getMonth() + 1),
    y: date_ob.getFullYear()
  })
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(?::\d{2})?$/

async function setSystemTime(date, time) {
  const { execFile } = require('child_process')
  return new Promise((resolve) => {
    execFile('sudo', ['timedatectl', 'set-ntp', 'false'], () => {
      execFile('sudo', ['date', '-s', `${date} ${time}`], (error, stdout) => {
        if (error) scribbles.warn(`set time failed: ${error.message}`)
        else scribbles.log(`Set time: '${date} ${time}' result ${stdout}`)
        resolve()
      })
    })
  })
}

app.post("/set_time", (req, res) => {
  const inData = req.body || {}
  scribbles.log(`input time: ${inData.time} date: ${inData.date}`)

  if (!DATE_RE.test(inData.date || '') || !TIME_RE.test(inData.time || '')) {
    scribbles.warn(`/set_time rejected — invalid date/time: ${JSON.stringify(inData)}`)
    return res.status(400).json({ error: 'invalid_datetime', message: 'date must be YYYY-MM-DD, time HH:MM[:SS]' })
  }
  setSystemTime(inData.date, inData.time)

  try {
    let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    config.time.NTP = '0'
    atomicWriteJsonSync('../meta/player_config.json', config, { mode: 0o600 })
  } catch (err) {
    scribbles.warn(`Write ntp config error: ${err}`)
  }
  return res.end('done')

});



app.get("/get_system_status", (req, res) => {
  try {
    var osu = require('node-os-utils')
    var cpu = osu.cpu
    var drive = osu.drive
    var mem = osu.mem
    let status
    Promise.all([
      cpu.usage(),
      drive.info(),
      mem.info(),
      execPromise(`sensors -j coretemp-isa-0000`)
    ]).then(responses => {

      let rawSensors = JSON.parse(responses[3])

      var temp = (rawSensors['coretemp-isa-0000']['Core 0']['temp2_input'] + rawSensors['coretemp-isa-0000']['Core 1']['temp3_input'] + rawSensors['coretemp-isa-0000']['Core 2']['temp4_input'] + rawSensors['coretemp-isa-0000']['Core 3']['temp5_input']) / 4


      status = {
        cpu_load: responses[0],
        ram_usage: `${parseFloat(responses[2].usedMemMb / 1000).toFixed(1)}/${parseFloat(responses[2].totalMemMb / 1000).toFixed(1)}`,
        hdd_usage: `${responses[1].usedGb}/${responses[1].totalGb}`,
        soc_temp: temp
      }

      res.send({
        status: status
      })
    })
  } catch { }

});



app.get("/get_screenshot", (req, res) => {
  scribbles.log(`make a screenshot`)
  const args = ['-silent', '-synchronize', '-window', 'root', 'png:-']
  const proc = spawn('sudo', ['-u', 'playerok', 'import', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  const chunks = []

  proc.stdout.on('data', (chunk) => {
    chunks.push(chunk)
  })

  proc.stderr.on('data', (data) => {
    const msg = data.toString().trim()
    if (msg) {
      scribbles.warn(`screenshot stderr: ${msg}`)
    }
  })

  proc.on('error', (err) => {
    scribbles.error(`screenshot process error: ${err}`)
    res.status(500).send('Screenshot failed')
  })

  proc.on('close', (code, signal) => {
    if (code !== 0) {
      scribbles.error(`screenshot process exited ${code} ${signal}`)
      return res.status(500).send('Screenshot failed')
    }
    const buffer = Buffer.concat(chunks)
    res.set('Content-Type', 'image/png')
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.send(buffer)
  })
})

app.get("/get_logs", (req, res) => {

  try {
    let logs = fs.readFileSync('/home/playerok/playerok/logs/playerok.log', 'utf8')
    res.send(redactSecrets(logs))
    scribbles.log(`send logs ok`)
  } catch {
    scribbles.error(`send logs fail`)
  }

})

const STATIC_LOG_FILES = ['playerok.log', 'scheduler.log', 'webKa.log', 'player_log.log', 'supervisor.log', 'screen_sound_config.log', 'usb_storage.log', 'uart2mqtt.log'];
const SCRIPT_LOG_RE = /^script_[A-Za-z0-9._-]+\.log$/;

app.get("/api/logs", (req, res) => {
  try {
    const entries = fs.readdirSync('/home/playerok/playerok/logs');
    const scriptLogs = entries.filter(n => SCRIPT_LOG_RE.test(n)).sort();
    res.json({ static: STATIC_LOG_FILES, scripts: scriptLogs });
  } catch (err) {
    scribbles.error(`list logs fail: ${err}`);
    res.status(500).json({ error: 'list_failed' });
  }
});

app.get("/api/logs/:filename", (req, res) => {
  const filename = req.params.filename;
  if (!STATIC_LOG_FILES.includes(filename) && !SCRIPT_LOG_RE.test(filename)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const logPath = path.join('/home/playerok/playerok/logs', filename);
    const logs = fs.readFileSync(logPath, 'utf8');
    res.send(redactSecrets(logs));
  } catch (err) {
    // Per-script logs only exist after the script has run at least once; for
    // a never-launched task return 200 + empty body so the UI shows "no
    // entries yet" instead of a confusing 500.
    if (err && err.code === 'ENOENT') return res.status(200).send('');
    scribbles.error(`send logs fail: ${err}`);
    res.status(500).send('Error reading log');
  }
});


scribbles.log(`Listening on port ${port}`);

//scribbles.log(os.cpus());
//scribbles.log(os.totalmem());
//scribbles.log(os.freemem())
