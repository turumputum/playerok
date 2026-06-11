var tar = require('tar-fs')
const fs = require('fs');
const path = require('path');
const scribbles = require('scribbles');
const { fork, spawn, spawnSync, exec, execFile, execFileSync } = require('child_process');

function execPromise(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.warn(error)
        }
        resolve(stdout ? stdout : stderr);
      })
    })
}

function execFilePromise(file, args) {
    return new Promise((resolve, reject) => {
      execFile(file, args, (error, stdout, stderr) => {
        if (error) return reject(error)
        resolve(stdout || stderr)
      })
    })
}

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

const REPO_ROOT = '/home/playerok/playerok'
const PUBKEY_PATH = path.join(REPO_ROOT, 'meta', 'update-pubkey.pem')

// Archive basename must look like a normal tar: letters/digits/-/_/. only,
// must end in .tar or .tar.gz, no path separators, no leading dot.
const ARCHIVE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.tar(?:\.gz)?$/

var args = process.argv.slice(2);
if (!args[0] || typeof args[0] !== 'string') {
    scribbles.log(`wrong argument`)
    process.exit(1)
}

const argName = args[0].replace(/^\/+/, '')
if (!ARCHIVE_NAME_RE.test(argName)) {
    scribbles.error(`updater rejected — archive name must match ${ARCHIVE_NAME_RE} (got ${JSON.stringify(args[0])})`)
    process.exit(1)
}

const arhive_path = path.join(REPO_ROOT, argName)
// Defence-in-depth: even after the regex above, ensure resolved path is under REPO_ROOT
if (!arhive_path.startsWith(REPO_ROOT + path.sep)) {
    scribbles.error(`updater rejected — resolved archive path escapes repo root: ${arhive_path}`)
    process.exit(1)
}

if (!fs.existsSync(arhive_path)) {
    scribbles.log(`file does not exist: ${arhive_path}`)
    process.exit(1)
}

// --- Signature verification ---
// We support an opt-in trust anchor at meta/update-pubkey.pem.
// When present: an .sig file (raw signature, sha256) must sit next to the
// archive and verify with `openssl dgst -sha256 -verify <pubkey>`.
// When absent: log a loud warning and continue — this lets existing manual
// update workflows keep working while flagging the gap.
async function verifySignature(archivePath) {
    if (!fs.existsSync(PUBKEY_PATH)) {
        scribbles.warn(`UNSIGNED UPDATE: no ${PUBKEY_PATH} — set up signing to lock this down`)
        return true
    }
    const sigPath = archivePath + '.sig'
    if (!fs.existsSync(sigPath)) {
        scribbles.error(`signature file missing: ${sigPath}`)
        return false
    }
    try {
        const out = execFileSync('openssl', [
            'dgst', '-sha256', '-verify', PUBKEY_PATH,
            '-signature', sigPath,
            archivePath
        ], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
        if (/Verified OK/i.test(out)) {
            scribbles.log(`signature verified: ${sigPath}`)
            return true
        }
        scribbles.error(`signature check did not return 'Verified OK': ${out.trim()}`)
        return false
    } catch (e) {
        scribbles.error(`openssl verify failed: ${e.message}`)
        return false
    }
}

// Reject entries that try to escape the extraction root or use absolute paths.
// tar-fs passes the entry name to `ignore` — return true to skip it (or throw
// to abort the whole extraction). We use `ignore` for hard refusal.
function makeSafeFilter(extractRoot) {
    const resolvedRoot = path.resolve(extractRoot)
    return function ignoreEntry(name, header) {
        const entryName = header && header.name ? header.name : name
        if (!entryName || typeof entryName !== 'string') return true
        if (path.isAbsolute(entryName)) {
            scribbles.warn(`tar entry rejected — absolute path: ${entryName}`)
            return true
        }
        if (entryName.split(/[\\\/]/).some(seg => seg === '..')) {
            scribbles.warn(`tar entry rejected — contains ..: ${entryName}`)
            return true
        }
        const resolved = path.resolve(resolvedRoot, entryName)
        if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
            scribbles.warn(`tar entry rejected — escapes extract root: ${entryName}`)
            return true
        }
        // Refuse symlinks/hardlinks (they can point outside the extract root).
        if (header && (header.type === 'symlink' || header.type === 'link')) {
            scribbles.warn(`tar entry rejected — link entry: ${entryName} -> ${header.linkname}`)
            return true
        }
        return false
    }
}

async function main() {
    const sigOk = await verifySignature(arhive_path)
    if (!sigOk) {
        scribbles.error(`update aborted — signature verification failed`)
        process.exit(1)
    }

    // Derive extraction dir from the archive *basename* (strip .tar / .tar.gz),
    // not from args[0].split('.')[0] which is fragile and shell-unsafe.
    const baseNoExt = argName.replace(/\.tar(?:\.gz)?$/, '')
    const updateDir = path.join(REPO_ROOT, baseNoExt)
    if (!updateDir.startsWith(REPO_ROOT + path.sep)) {
        scribbles.error(`updater rejected — extract dir escapes repo root: ${updateDir}`)
        process.exit(1)
    }

    try {
        fs.mkdirSync(updateDir, { recursive: true, mode: 0o700 })
    } catch (e) {
        scribbles.error(`mkdir extract dir failed: ${e.message}`)
        process.exit(1)
    }
    scribbles.log(`arh:${arhive_path} update_dir:${updateDir}`)

    fs.createReadStream(arhive_path)
        .pipe(tar.extract(updateDir, { ignore: makeSafeFilter(updateDir) }))
        .on('error', (err) => {
            scribbles.error(`tar extract error: ${err.message}`)
            process.exit(1)
        })
        .on('finish', () => {
            const updateScript = path.join(updateDir, 'update.sh')
            // Defense in depth: even though makeSafeFilter prevents escapes,
            // re-check that update.sh resolves inside updateDir.
            const resolvedScript = path.resolve(updateScript)
            if (!resolvedScript.startsWith(updateDir + path.sep)) {
                scribbles.error(`update.sh path escapes update dir: ${resolvedScript}`)
                process.exit(1)
            }
            if (!fs.existsSync(resolvedScript)) {
                scribbles.log(`Update script not found`)
                process.exit(1)
            }
            scribbles.log(`Unpack OK, run script: ${resolvedScript}`)
            // Run via execFile, not exec — the path is absolute & validated.
            execFilePromise('sh', [resolvedScript])
                .then(() => {
                    try { fs.unlinkSync(arhive_path) } catch {}
                    try { fs.rmSync(updateDir, { recursive: true, force: true }) } catch {}
                })
                .then(() => {
                    scribbles.log(`Update OK, exit`)
                    process.exit(0)
                })
                .catch(err => {
                    scribbles.error(`update.sh failed: ${err.message || err}`)
                    process.exit(1)
                })
        })
}

main()
