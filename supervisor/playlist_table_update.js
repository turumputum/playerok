require('log-timestamp');
const file_tools = require("../meta/tools/file_tools");
const fs = require("fs");
const path = require('path');

var playlist_table=[]

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

console.log("Playlist table updated started")

try {
    var fileList = walkSync('../data')
    for (var filePath of fileList) {
        filePath = filePath.slice(3)
        if (file_tools.check_type(filePath) == 'json') {
            let playlist_file = {
                "path": filePath,
                "name": filePath.split('/').slice(-1)[0],
                "type":"multimedia"
            }
            playlist_file.name = playlist_file.name.split('.').slice(-2, -1)[0]
            playlist_table.push(playlist_file)
        }
        if (file_tools.check_type(filePath) == 'script') {
            let playlist_file = {
                "path": filePath,
                "name": filePath.split('/').slice(-1)[0],
                "type":"utility "
            }
            playlist_file.name = playlist_file.name.split('.').slice(-2, -1)[0]
            playlist_table.push(playlist_file)
        }
    }
    fs.writeFileSync('../meta/playlist-table.json', JSON.stringify(playlist_table, null, 2))
    console.log("Playlist table updated OK")
}catch(err){
    console.log("Playlist table updated FAIL: " + err)
}