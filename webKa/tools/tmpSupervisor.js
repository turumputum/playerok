const fs = require("fs");
var md5 = require('md5');
const path = require("path");
const file_tools = require("./file_tools");

function relative(...paths) {
  
    var finalPath = paths.reduce((a, b) => path.join(a, b), process.cwd());
     
    if (path.relative(process.cwd(), finalPath).startsWith("..")) {
      throw new Error("Failed to resolve path outside of the working directory");
    }
    return finalPath;
  }

module.exports = {
    scan_playlist: function () {
        console.log('scan_playlist');
        
        let readDir = new Promise((resolve, reject) => {
            fs.readdir('./data/playlists', (err, filenames) => {
                if (err) {
                    return reject(err);
                }
                //console.log(filenames);
                return resolve(filenames);
            });
        });

        readDir
            .then((filenames) => {
                const promises = filenames.map(
                    (f) =>
                        new Promise((resolve, reject) => {
                            fs.stat(relative('./data/playlists', f), (err, stats) => {
                                if (err) {
                                    console.warn(err);
                                    return resolve({
                                        name: f,
                                        error: err,
                                    });
                                }
                                fs.readFile(relative('./data/playlists', f), function (err, buf) {
                                    if (err) {
                                        console.warn(err);
                                        return resolve({
                                            name: f,
                                            error: err,
                                        })
                                    }
                                    var id_md5 = md5(buf)
                                    console.log('calc md5');
                                    resolve({
                                        name: f,
                                        id_md5: id_md5,
                                        path: './data/playlists' + f,
                                        type: file_tools.check_type(f, stats),
                                    });
                                });
                            })
                        })
                    )

                    Promise.all(promises)
                        .then((files) => {
                            console.log('lets write');
                            var table = files
                            fs.writeFile('./meta/playlist-table.json', JSON.stringify(table, null, 2), function (err) {
                                if (err) return console.log(err);
                                console.log('playlist-table.json   write OK ');
                            })
                        })
                        .catch((err) => {
                            console.error(err);
                        })
            })
    }
}