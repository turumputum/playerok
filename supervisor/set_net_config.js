const { spawnSync, spawn, exec, execFile, execSync } = require('child_process');

const fs = require("fs");

const scribbles = require('scribbles');

function netmask2CIDR(netmask) {
  return (netmask.split('.').map(Number)
    .map(part => (part >>> 0).toString(2))
    .join('')).split('1').length - 1;
}

async function asyncSpawn(cmd, arg) {
  const childProcess = spawnSync(cmd, [arg],
    { stdio: [process.stdin, process.stdout, process.stderr] });
}

async function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        scribbles.warn(error)
      }
      resolve(stdout ? stdout : stderr);
    })
  })
}

// execFile runs the program directly, NOT through a shell — so spaces, quotes,
// $(...), backticks, ; etc. in args are treated as literal characters.
// Use this for any command where any argument is built from config or user input.
async function execFilePromise(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, opts, (error, stdout, stderr) => {
      if (error) {
        // Do NOT log the args array — may contain Wi-Fi PSK
        scribbles.warn(`execFile ${file} failed: ${error.code || error.message}`)
      }
      resolve(stdout || stderr)
    })
  })
}

function tryExecSync(cmd){
  try{
    return execSync(cmd)
  }catch{
    scribbles.log(`exec ${cmd} failed`)
    return 'fail'
  }
}

// ---- validators (return true if value is safe to use as nmcli arg) ----
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/
function isIPv4(s) { return typeof s === 'string' && IPV4_RE.test(s) }
function isIPv4List(s) {
  if (typeof s !== 'string' || !s.length) return false
  return s.split(/[,\s]+/).filter(Boolean).every(isIPv4)
}
function isNetmask(s) {
  if (!isIPv4(s)) return false
  // valid contiguous mask: in binary form, all 1s come before all 0s
  const bin = s.split('.').map(n => (+n).toString(2).padStart(8, '0')).join('')
  return /^1*0*$/.test(bin)
}
function isWifiSSID(s) {
  // SSID may be 0-32 bytes of arbitrary octets per spec; in practice we accept printable + space
  if (typeof s !== 'string') return false
  if (s.length === 0 || s.length > 32) return false
  if (s.indexOf('\0') !== -1) return false
  return true
}
function isWifiPSK(s) {
  // WPA2-PSK: 8-63 ASCII printable characters
  if (typeof s !== 'string') return false
  if (s.length < 8 || s.length > 63) return false
  return /^[\x20-\x7e]+$/.test(s)
}
function isIface(s) { return typeof s === 'string' && /^[a-z0-9]{1,15}$/.test(s) }

// Probe the target SSID's advertised security in the current scan and map it
// to an nmcli key-mgmt value: 'open' | 'wpa-psk' | 'sae'. Returns null when the
// SSID is not visible (caller then falls back to a password-presence guess).
//
// `nmcli -t` escapes ':' inside fields as '\:'. The SECURITY field never
// contains ':', so the FIRST unescaped ':' separates SECURITY from the SSID
// (which may itself contain ':'). We request 'SECURITY,SSID' so SSID is last.
async function detectWifiKeyMgmt(ssid) {
  const out = (await execFilePromise('nmcli',
    ['-t', '-f', 'SECURITY,SSID', 'dev', 'wifi', 'list', '--rescan', 'yes'])) || ''
  for (const line of out.split(/\r?\n/)) {
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const security = line.slice(0, idx)
    const name = line.slice(idx + 1).replace(/\\:/g, ':')
    if (name !== ssid) continue
    const s = security.toUpperCase()
    if (!s.trim() || s === 'NONE') return 'open'
    const hasWpa3 = s.includes('WPA3') || s.includes('SAE')
    const hasLegacy = s.includes('WPA1') || s.includes('WPA2') ||
                      (s.includes('WPA') && !s.includes('WPA3'))
    if (hasWpa3 && !hasLegacy) return 'sae'  // WPA3-only AP
    return 'wpa-psk'                          // WPA2, or WPA2/WPA3 transition
  }
  return null  // SSID not currently in scan range
}

// Configure the (freshly created, open-by-default) wlan0 profile's security to
// match the target network. Must run BEFORE `nmcli con up wlan0`, otherwise the
// first association is attempted without credentials and fails.
async function applyWlan0Security(wlan) {
  const ssid = wlan.SSID
  const psk = wlan.password
  if (!isWifiSSID(ssid)) {
    scribbles.warn(`Invalid Wi-Fi SSID — skipping wifi security`)
    return
  }
  await execFilePromise('nmcli', ['con', 'mod', 'wlan0', 'wifi.ssid', ssid])

  let mode = await detectWifiKeyMgmt(ssid)
  if (mode === null) {
    // Not visible right now — guess from whether a usable password was given.
    mode = isWifiPSK(psk) ? 'wpa-psk' : 'open'
    scribbles.log(`Wi-Fi "${ssid}" not visible in scan, assuming ${mode}`)
  }

  if (mode === 'open') {
    // Profile is recreated open each run, so nothing to add. (Do NOT log the PSK.)
    scribbles.log(`Wi-Fi "${ssid}" configured as open network`)
    return
  }

  if (!isWifiPSK(psk)) {
    scribbles.warn(`Wi-Fi "${ssid}" is secured but password is missing/invalid (need 8-63 chars) — skipping credentials`)
    return
  }
  await execFilePromise('nmcli', ['con', 'mod', 'wlan0', 'wifi-sec.key-mgmt', mode])
  await execFilePromise('nmcli', ['con', 'mod', 'wlan0', 'wifi-sec.psk', psk])
  // WPA3-SAE mandates Protected Management Frames (required); leave NM's default
  // (optional) for WPA2 so transition APs still associate.
  await execFilePromise('nmcli', ['con', 'mod', 'wlan0', 'wifi-sec.pmf', mode === 'sae' ? '3' : '0'])
  scribbles.log(`Wi-Fi "${ssid}" configured with key-mgmt=${mode}`)
}


async function set_net_config() {
  try {

    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    //scribbles.log(`Set log level ${config.log.level}`)
    scribbles.config({
      logLevel: config.log.level,
      format: '{time} [{fileName}] <{logLevel}> {message}'
    })

  } catch (err) {
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
  }
  
  //await execPromise(`sudo nmcli general hostname ${config.net.mDNS_name}`)
  const mdnsName = config.net.mDNS_name
  if (typeof mdnsName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(mdnsName)) {
    scribbles.warn(`Invalid mDNS_name ${JSON.stringify(mdnsName)} — skipping hostname change`)
  } else {
    await execPromise(`sudo hostnamectl set-hostname ${mdnsName}`)
    // keep /etc/hosts in sync so local short-name resolution works after rename
    await execPromise(`sudo sed -i -E '/^127\\.0\\.1\\.1[[:space:]]/d' /etc/hosts`)
    await execPromise(`echo -e '127.0.1.1\\t${mdnsName}' | sudo tee -a /etc/hosts > /dev/null`)
    // ensure avahi re-publishes under the new name immediately
    await execPromise(`sudo systemctl reload-or-restart avahi-daemon`)
  }


  const ifMassE = ['eth0', 'eth1', 'wlan0'];
  for (let iface of ifMassE) {
    if (!isIface(iface)) continue  // defensive: should always pass for the static list

    await execFilePromise('sudo', ['nmcli', 'connection', 'delete', iface])

    // Re-check by listing connections without a shell pipe
    const existing = (await execFilePromise('nmcli', ['-f', 'NAME', 'con', 'show'])) || ''
    if (!existing.split(/\r?\n/).some(line => line.trim() === iface)) {
      scribbles.log(`Conn: ${iface} not found, creating...`)
      if ((iface == 'eth0') || (iface == 'eth1')) {
        await execFilePromise('nmcli', ['con', 'add', 'type', 'ethernet', 'con-name', iface, 'ifname', iface])
      } else {
        const ssid = config.net.wlan0.SSID
        if (!isWifiSSID(ssid)) {
          scribbles.warn(`Invalid Wi-Fi SSID — skipping wifi connection creation`)
          continue
        }
        await execFilePromise('nmcli', ['con', 'add', 'type', 'wifi', 'con-name', iface, 'ifname', iface, 'ssid', ssid])
      }
    }
    await execFilePromise('sudo', ['nmcli', 'con', 'mod', iface, 'ipv6.method', 'disabled'])
    await execFilePromise('nmcli', ['con', 'mod', iface, 'connection.autoconnect', 'yes'])
    await execFilePromise('nmcli', ['con', 'mod', iface, 'connection.mdns', '2'])

    if (config.net[iface].DHCP == 1) {
      await execFilePromise('nmcli', ['con', 'mod', iface, 'ipv4.method', 'auto'])
      await execFilePromise('sudo', ['dhclient'])
    } else if (config.net[iface].DHCP == 0) {
      const ip = config.net[iface].IP
      const mask = config.net[iface].net_mask
      const gw = config.net[iface].gateway
      const dns = config.net[iface].DNS
      if (!isIPv4(ip))      { scribbles.warn(`Invalid IP for ${iface} — skipping static config`); continue }
      if (!isNetmask(mask)) { scribbles.warn(`Invalid netmask for ${iface} — skipping static config`); continue }
      if (!isIPv4(gw))      { scribbles.warn(`Invalid gateway for ${iface} — skipping static config`); continue }
      if (!isIPv4List(dns)) { scribbles.warn(`Invalid DNS for ${iface} — skipping static config`); continue }
      const cidr = netmask2CIDR(mask)
      await execFilePromise('nmcli', ['con', 'mod', iface, 'ipv4.addresses', `${ip}/${cidr}`])
      await execFilePromise('nmcli', ['con', 'mod', iface, 'ipv4.method', 'manual'])
      await execFilePromise('nmcli', ['con', 'mod', iface, 'ipv4.gateway', gw])
      await execFilePromise('nmcli', ['con', 'mod', iface, 'ipv4.dns', dns])
    }

    // Wi-Fi security must be set on the profile BEFORE bringing it up, and only
    // when the radio is enabled. Detection auto-selects open / WPA2 / WPA3-SAE.
    if (iface === 'wlan0' && config.net.wlan0.enable == 1) {
      await applyWlan0Security(config.net.wlan0)
    }

    if (config.net[iface].enable == 1) {
      await execFilePromise('nmcli', ['con', 'up', iface])
    } else {
      await execFilePromise('nmcli', ['con', 'down', iface])
    }
  }

}


set_net_config()
