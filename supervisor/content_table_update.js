require('log-timestamp');
const file_tools = require("../meta/tools/file_tools");

const fs = require("fs");
const path = require('path');

var content_list = {
    "image": [],
    "video": [],
    "sound": []
}

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
    var fileList = walkSync('../data')

    for (var filePath of fileList) {
        filePath = filePath.slice(3)
        if (file_tools.check_type(filePath) == 'pic') {
            let pic_file = {
                "path": filePath,
                "name": filePath.split('/').slice(-1)[0]
            }
            pic_file.name = pic_file.name.split('.').slice(-2, -1)[0]
            content_list.image.push(pic_file)
        }

        if (file_tools.check_type(filePath) == 'video') {
            let vid_file = {
                "path": filePath,
                "name": filePath.split('/').slice(-1)[0]
            }
            vid_file.name = vid_file.name.split('.').slice(-2, -1)[0]
            content_list.video.push(vid_file)
        }


        if (file_tools.check_type(filePath) == 'sound') {
            let sound_file = {
                "path": filePath,
                "name": filePath.split('/').slice(-1)[0]
            }
            sound_file.name = sound_file.name.split('.').slice(-2, -1)[0]
            content_list.sound.push(sound_file)
        }
    }


    fs.writeFileSync('../meta/content-table.json', JSON.stringify(content_list, null, 2))
    console.log("Content table updated OK")
} catch (err) {
    console.log("Content table updated FAIL: " + err)
}
