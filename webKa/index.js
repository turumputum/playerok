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

const { exec, execSync } = require('child_process');
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
app.use('/meta', express.static('/home/playerok/playerok/meta'))
app.use('/logs', express.static('/home/playerok/playerok/logs'))
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
app.set('view engine', 'pug')

var config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
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


app.get('/reboot', function (req, res) {
  scribbles.log("time to reboot")
  execPromise('sudo reboot')
  return res.redirect('/');
});

app.get('/power_off', function (req, res) {
  execPromise('sudo poweroff')
  return res.redirect('/');
});





//----------------CONFIG------------------------------

app.use(
  session({
    secret: process.env.SESSION_KEY || "meowmeow",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());
app.use(fileUpload());
app.use(
  bodyParser.urlencoded({
    extended: false,
  })
);


function relative(...paths) {

  var finalPath = paths.reduce((a, b) => path.join(a, b), process.cwd());

  // if (path.relative(process.cwd(), finalPath).startsWith("..")) {
  //   throw new Error("Failed to resolve path outside of the working directory");
  // }
  return finalPath;
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
  if (req.method === "GET") {
    return next();
  }
  let sourceHost = null;
  if (req.headers.origin) {
    sourceHost = new URL(req.headers.origin).host;
  } else if (req.headers.referer) {
    sourceHost = new URL(req.headers.referer).host;
  }
  if (sourceHost !== req.headers.host) {
    throw new Error(
      "Origin or Referer header does not match or is missing. Request has been blocked to prevent CSRF"
    );
  }
  next();
});


app.all("/data*", (req, res, next) => {

  res.filename = '../data' + req.params[0];
  //scribbles.log("all filename: " + res.filename)

  let fileExists = new Promise((resolve, reject) => {
    // check if file exists
    //fs.stat(relative(res.filename), (err, stats) => {
    fs.stat(res.filename, (err, stats) => {
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
  const move_data = JSON.parse(Object.keys(req.body)[0])
  move_data.new_path_val = '../' + move_data.new_path_val
  res.filename = "../data/" + req.params[0]
  scribbles.log("lets move: " + move_data.file_name + " from " + res.filename + "  to  " + move_data.new_path_val)

  new Promise((resolve, reject) => {
    fs.access(relative(res.filename), fs.constants.W_OK, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  })
    .then(() => {
      new Promise((resolve, reject) => {
        fs.rename(
          relative(res.filename, move_data.file_name),
          relative(move_data.new_path_val, move_data.file_name),
          (err) => {
            if (err) {
              return reject(err);
            }
            resolve();
          }
        );
      })
        .then(() => {
          scribbles.log("move ok")
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


app.post('/data/*@upload', function (req, res) {
  let file_path = req.url.replace("@upload", '')

  let sampleFile;
  let uploadPath;

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  //scribbles.log(JSON.stringify(req.files, null, 2))
  sampleFile = req.files.file;
  uploadPath = '../' + file_path;

  //Use the mv() method to place the file somewhere on your server
  sampleFile.mv(uploadPath, function (err) {
    if (err){
      scribbles.err(`Upload error: ${err} path: ${uploadPath}`)
      return res.status(500).send(err);
    }

    res.send('complete').end();
  });

  
});

app.post("/data/*@mkdir", (req, res) => {
  res.filename = "../data/" + req.params[0];

  //let folder = req.body.folder;
  let folder = JSON.parse(Object.keys(req.body)[0]).folder_name

  scribbles.log("lets make directory " + res.filename + folder)
  if (!folder || folder.length < 1) {
    return res.status(400).end();
  }

  let fileExists = new Promise((resolve, reject) => {
    // Check if file exists
    fs.stat(relative(res.filename, folder), (err, stats) => {
      if (err) {
        return reject(err);
      }
      return resolve(stats);
    });
  });

  fileExists
    .then((stats) => {
      scribbles.log("Folder exists, cannot overwrite. ")
      req.flash("error", "Folder exists, cannot overwrite. ");
      res.redirect("back");
    })
    .catch((err) => {
      fs.mkdir(relative(res.filename, folder), (err) => {
        if (err) {
          scribbles.warn(err);
          req.flash("error", err.toString());
          res.redirect("back");
          return;
        }
        req.flash("success", "Folder created. ");
        res.redirect("back");
      });
    });
});

app.post("/data/*@delete", (req, res) => {
  const delete_data = JSON.parse(Object.keys(req.body)[0])
  res.filename = "../data/" + req.params[0];
  scribbles.log("filename to delet: " + res.filename + delete_data.del_name_val)

  //let files = JSON.parse(req.body.files);
  let files = [delete_data.del_name_val]
  if (!files || !files.map) {
    scribbles.log("error", "No files selected.");
    req.flash("error", "No files selected.");
    res.redirect("back");
    return; // res.status(400).end();
  }

  let promises = files.map((f) => {
    return new Promise((resolve, reject) => {
      fs.stat(relative(res.filename, f), (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve({
          name: f,
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
            op(relative(res.filename, f.name), (err) => {
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

app.get("/*@download", (req, res) => {
  res.filename = req.params[0];

  let files = null;
  try {
    files = JSON.parse(req.query.files);
  } catch (e) { }
  if (!files || !files.map) {
    req.flash("error", "No files selected.");
    res.redirect("back");
    return; // res.status(400).end();
  }

  let promises = files.map((f) => {
    return new Promise((resolve, reject) => {
      fs.stat(relative(res.filename, f), (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve({
          name: f,
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
          zip.file(relative(res.filename, f.name), { name: f.name });
        });
      files
        .filter((f) => f.isdirectory)
        .forEach((f) => {
          zip.directory(relative(res.filename, f.name), f.name);
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
  const rename_data = JSON.parse(Object.keys(req.body)[0])
  //res.filename = req.params[0];
  scribbles.log("lets rename: " + rename_data.old_name_val + "  to  " + rename_data.new_name_val)
  scribbles.log("filename: " + res.filename)
  res.filename = "../data/" + req.params[0];
  new Promise((resolve, reject) => {
    fs.access(relative(res.filename), fs.constants.W_OK, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  })
    .then(() => {
      new Promise((resolve, reject) => {
        fs.rename(
          relative(res.filename, rename_data.old_name_val),
          relative(res.filename, rename_data.new_name_val),
          (err) => {
            if (err) {
              return reject(err);
            }
            resolve();
          }
        );
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
    
    if(!fs.existsSync('/home/playerok/playerok/'+task.playlist_path)){
      task.state ='File not foud'
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
  const task_to_delete = JSON.parse(Object.keys(req.body)[0])
  scribbles.log('task index to delete ' + task_to_delete.index_to_delete)
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  tasks.splice(task_to_delete.index_to_delete - 1, 1)
  //scribbles.log(tasks)
  fs.writeFileSync('../meta/scheduler-table.json', JSON.stringify(tasks, null, 2))

  return res.end('done')
});

app.post("/Scheduler/edit", (req, res) => {
  const task_to_edit = JSON.parse(Object.keys(req.body)[0])
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
  fs.writeFileSync('../meta/scheduler-table.json', data)

  return res.end('done')
});

app.post("/Scheduler/new", (req, res) => {
  const new_task = JSON.parse(Object.keys(req.body)[0])
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  tasks.push(new_task)

  let data = JSON.stringify(tasks, null, 2)
  fs.writeFileSync('../meta/scheduler-table.json', data)

  return res.end('done')
});

app.post("/save_scheduler_table", (req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])

  try {
    fs.writeFileSync('../meta/scheduler-table.json', JSON.stringify(inData, null, 2))
    scribbles.log(`scheduler-table save OK`)
  } catch (err) {
    scribbles.warn(`Write scheduler-table error: ${err}`)
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
      fs.readdir(relative(res.filename), (err, filenames) => {
        if (err) {
          return reject(err);
        }
        //scribbles.log(filenames);
        return resolve(filenames);
      });
    });

    readDir
      .then((filenames) => {
        const promises = filenames.map(
          (f) =>
            new Promise((resolve, reject) => {
              fs.stat(relative(res.filename, f), (err, stats) => {
                if (err) {
                  scribbles.warn(err);
                  return resolve({
                    name: f,
                    error: err,
                  });
                }
                let type = file_tools.check_type(f, stats)
                let size = (type == 'dir') ? (fastFolderSizeSync(res.filename + f)) : stats.size
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
    res.sendFile(relative(res.filename), {
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
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const path = '../' + req.url.split('?').slice(-1)[0]
  //scribbles.log("GET PATH PLAYLIST: "+ path)
  let playlist = JSON.parse(fs.readFileSync(path))
  let content_table = JSON.parse(fs.readFileSync('../meta/content-table.json'))
  //scribbles.log ("get playlist name: " + JSON.stringify(playlist.playlist_name))
  res.send({
    playlist: playlist,
    content_table: content_table
  })
});

app.post("/save_playlist*", (req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])
  var path = '../' + inData.path
  const playlist = inData.playlist
  // const path = req.url.split('?').slice(-1)[0]
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
      if (fs.existsSync(path)) {
        fs.unlink(path, (err => {
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
      path = '../' + playlist_table[playlistIndex].path
      scribbles.log(`rename playlist name OK`)
    }
  }

  fs.writeFileSync(('../meta/scheduler-table.json'), JSON.stringify(scheduler_table, null, 2))
  fs.writeFileSync(('../meta/playlist-table.json'), JSON.stringify(playlist_table, null, 2))

  //scribbles.log("Save PLAYLIST:"+ JSON.stringify(inData,null,2)+" path: "+path)
  fs.writeFileSync((path), JSON.stringify(playlist, null, 2))

  return res.end('done')
});

app.post("/delete_playlist*", (req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])

  scribbles.log(`Delete name: ${inData.name_to_delete} on index: ${inData.index_to_delete}`)
  // const path = req.url.split('?').slice(-1)[0]


  let playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))

  const path = '../' + playlist_table[inData.index_to_delete - 1].path

  let scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
  //scribbles.log(`before------------------- \n${JSON.stringify(scheduler_table,null,2)}`);
  scheduler_table = scheduler_table.filter(task => task.path != playlist_table[inData.index_to_delete - 1].path)
  //scribbles.log(`after------------------- \n${JSON.stringify(scheduler_table,null,2)}`);
  fs.writeFileSync(('../meta/scheduler-table.json'), JSON.stringify(scheduler_table, null, 2))

  playlist_table.splice(inData.index_to_delete - 1, 1)
  fs.writeFileSync(('../meta/playlist-table.json'), JSON.stringify(playlist_table, null, 2))



  scribbles.log("Delete PLAYLIST: " + JSON.stringify(inData, null, 2) + " path: " + path)
  //fs.writeFileSync((path), JSON.stringify(playlist,null,2))
  if (fs.existsSync(path)) {
    fs.unlink(path, (err => {
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
    let net_info = {};
    //console.log(config.net['eth0'].DHCP)

    let netAddrs = JSON.parse(responses[0])
    //console.log(`netAddr:${responses[0]}`)
    let netRoutes = JSON.parse(responses[1])
    let screen_dev_list = xrandrParse(responses[2])
    const ifMass = ['eth0', 'eth1', 'wlan0'];

    for (let dev of netAddrs) {
      for (let iface of ifMass) {
        try {
          if (dev.ifname == iface) {
            net_info[iface] = {}
            if (iface == 'eth0' || iface == 'eth1') {
              net_info[iface]["carrier"] = execSync(`head /sys/class/net/${iface}/carrier`).toString().replace("\n", '')
            } else {
              if (dev.operstate == 'UP') {
                net_info[iface]["carrier"] = parseInt(execSync(`nmcli -f ACTIVE,SIGNAL dev wifi list | grep yes`).toString().replace("yes", ''))
              } else {
                net_info[iface]["carrier"] = 0
              }
            }

            //(config.net[iface].DHCP == 1) &&
            if ((dev.operstate == 'UP')) {
              net_info[iface]["IP"] = dev.addr_info[0].local
              //net_info[iface]['IP'] = dev.addr_info[0].local
              let block = new Netmask(`${dev.addr_info[0].local}/${dev.addr_info[0].prefixlen}`)
              net_info[iface]['net_mask'] = block.mask
              for (let route of netRoutes) {
                if (route.dev == iface) {
                  net_info[iface]['gateway'] = route.gateway
                  break
                }
              }
              if(config.net[iface].DHCP == 1){
                net_info[iface]['DNS'] = execSync(`nmcli device show ${iface} | grep IP4.DNS`).toString().split(":")[1].replace(/ /g, '').replace("\n", '')
              }else{
                net_info[iface]['DNS'] = config.net[iface].DNS
              }
            } else if (config.net[iface].DHCP == 0) {
              net_info[iface]["IP"] = config.net[iface].IP
              net_info[iface]['net_mask'] = config.net[iface].net_mask
              net_info[iface]['gateway'] = config.net[iface].gateway
              net_info[iface]['DNS'] = config.net[iface].DNS
            } else {
              net_info[iface]["IP"] = ''
              net_info[iface]['net_mask'] = ''
              net_info[iface]['gateway'] = ''
              net_info[iface]['DNS'] = ''
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
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])

  try {
    fs.writeFileSync('../meta/player_config.json', JSON.stringify(inData, null, 2))
    scribbles.log(`Config save OK`)
  } catch (err) {
    scribbles.warn(`Write config error: ${err}`)
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

async function setTimeout(date, time) {
  await exec(`sudo timedatectl set-ntp false`)

  await exec(`date -s '${date} ${time}'`, (error, stdout, stderr) => {
    if (error) {
      scribbles.warn(error)
    }
    scribbles.log(`Set time: '${date} ${time}' resault ${stdout}`)
  })
}

app.post("/set_time", (req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])
  scribbles.log(`input time: ${inData.time} date: ${inData.date}`)

  setTimeout(inData.date, inData.time)

  try {
    let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    config.time.NTP = '0'
    fs.writeFileSync('../meta/player_config.json', JSON.stringify(config, null, 2))
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
  let startTime = Date.now()
  execPromise(`sudo -u playerok import -synchronize -window root /home/playerok/playerok/meta/screen_shot.png`).then(() => {
    //scribbles.log(`startTime:${startTime}  endTime:${Date.now()}  delta:${Date.now() - startTime}`)
    res.send('done')
  })

})

app.get("/get_logs", (req, res) => {

  try {
    let logs = fs.readFileSync('/home/playerok/playerok/logs/playerok.log')
    res.send(logs)
    scribbles.log(`send logs ok`)
  } catch {
    scribbles.error(`send logs fail`)
  }

})

app.get("/get_topic_list", (req, res) => {

  try {
    let topics_list = fs.readFileSync('/home/playerok/playerok/meta/topics_list.json')
    res.send(topics_list)
    scribbles.log(`send topics_list ok`)
  } catch {
    scribbles.error(`send topics_list fail`)
  }

})
// fs.readdir('../data/playlists', function(err, list){
//   if (err) return done(err);
//     //------to-do-------chek playlist table---------------------
// })

scribbles.log(`Listening on port ${port}`);

//scribbles.log(os.cpus());
//scribbles.log(os.totalmem());
//scribbles.log(os.freemem())
