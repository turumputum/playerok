const scribbles = require('scribbles');
const file_tools = require("../meta/tools/file_tools");
const fs = require("fs");
const path = require('path');

var playlist_table = []

function* walkSync(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) {
            yield* walkSync(path.join(dir, file.name));
        } else {
            yield path.join(dir, file.name);
        }
    }
}

try {

    var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    //scribbles.log(`Set log level ${config.log.level}`)
    scribbles.config({
        logLevel: config.log.level,
        format: '{time} [{fileName}] <{logLevel}> {message}'
    })

} catch (err) {
    //scribbles.log("suka")
    scribbles.error(`Error read file: ${err}`)
    //log_file(`Error read file: ${err}`, '../logs/player_log.txt')
    process.exit(1);
}

try {
    var fileList = walkSync('../data')
    for (var filePath of fileList) {
        filePath = filePath.slice(3)
        if (!filePath.includes("node_modules")) {

            if ((file_tools.check_type(filePath) == 'json') && (filePath.includes("playlists"))) {
                let playlist_file = {
                    "path": filePath,
                    "name": filePath.split('/').slice(-1)[0],
                    "type": "multimedia"
                }
                playlist_file.name = playlist_file.name.split('.').slice(-2, -1)[0]
                playlist_table.push(playlist_file)
            }

            if (file_tools.check_type(filePath) == 'script') {

                let playlist_file = {
                    "path": filePath,
                    "name": filePath.split('/').slice(-1)[0],
                    "type": "script"
                }
                playlist_file.name = playlist_file.name.split('.').slice(-2, -1)[0]
                playlist_table.push(playlist_file)

            }
        }

    }
    fs.writeFileSync('../meta/playlist-table.json', JSON.stringify(playlist_table, null, 2))
    scribbles.log("Playlist table updated OK")
} catch (err) {
    scribbles.log("Playlist table updated FAIL: " + err)
}