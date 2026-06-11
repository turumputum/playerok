// Shared MQTT auth options for all PlayerOK Node services.
//
// The appliance uses ONE password everywhere — admin panel (webKa basic-auth),
// SSH (the admin_login UNIX account) and the MQTT bus. This helper reads the
// admin credentials from player_config.json and returns them as node-mqtt
// connect options. Passing them is harmless while the broker still allows
// anonymous access, and required once mosquitto enforces a password_file.
//
// Usage (any service, regardless of cwd — absolute require path):
//   const { mqttAuthOpts } = require('/home/playerok/playerok/meta/mqtt_auth.js')
//   mqtt.connect('mqtt://127.0.0.1:1883', mqttAuthOpts())

const fs = require('fs')

const CONFIG_PATH = '/home/playerok/playerok/meta/player_config.json'

function mqttAuthOpts() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH))
    const username = cfg && cfg.security && cfg.security.admin_login
    const password = cfg && cfg.security && cfg.security.admin_pass
    if (username && password) {
      return { username, password }
    }
  } catch (e) {
    // Config unreadable — fall back to anonymous so a broken config file
    // doesn't take the whole bus down.
  }
  return {}
}

module.exports = { mqttAuthOpts }
