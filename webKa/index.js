#!/usr/bin/env node

/* jshint esversion: 6 */
/* jshint node: true */
"use strict";

const helperFuncs = require('./assets/helperFuncs');

const express = require("express");
const session = require("express-session");
const Busboy = require("connect-busboy");
const fileUpload = require('express-fileupload');
const flash = require("connect-flash");
//const querystring = require("querystring");
//const assets = require("./assets");
const archiver = require("archiver");

//const notp = require("notp");
//const base32 = require("thirty-two");

const fs = require("fs");
const rimraf = require("rimraf");
const path = require("path");

const { exec } = require('child_process');

//const filesize = require("filesize");
//const dirTree = require('directory-tree');
//const recursiveFilter = require("recursive-filter");
//const octicons = require("@primer/octicons");
const file_tools = require("../meta/tools/file_tools");
//const tmpSupervisor = require("./tools/tmpSupervisor");

var bodyParser = require('body-parser');

const mqtt = require("mqtt");
//const client  = mqtt.connect('mqtt://127.0.0.1:1883')

//var os = require('os');


var currentPage = "home";
var configAndStatus = "";

const port = +process.env.PORT || 80

const app = express();
const http = app.listen(port);

app.set("views", path.join(__dirname, "views"));
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')))
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js'))) 
app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist'))) 
app.use('/bootstrap5-toggle', express.static(path.join(__dirname, 'node_modules/bootstrap5-toggle'))) 
app.use('/treeview', express.static(path.join(__dirname, 'bower_components/bootstrap-treeview/dist'))) 
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'))) 
app.use('/bootstrap-icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons'))) 
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/icons", express.static(path.join(__dirname, "views/icons")));
app.use("/data", express.static(path.join(__dirname, "data")));
app.set('view engine', 'pug')
 
//----------------MQTT------------------------------
// client.on('connect', function () {
//   console.log("mqtt brocker connected!");
//   client.subscribe('presence', function (err) {
//     if (!err) {
//       client.publish('presence', 'Hello mqtt')
//     }
//   })
// })

// client.on('message', function (topic, message) {
//   // message is Buffer
//   console.log(message.toString())
// })

//----------------MQTT------------------------------



//----------------CONFIG------------------------------
function readConfigAndStatus(){
  let rawdata = fs.readFileSync('../meta/player_config.json');
  configAndStatus = JSON.parse(rawdata);
  console.log("configAndStatus read ok");
}

readConfigAndStatus();

//----------------CONFIG------------------------------

app.use(
  session({
    secret: process.env.SESSION_KEY || "meowmeow",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());
//app.use('../data/*@upload',busboy());
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
  
  res.filename = '../data'+req.params[0];
  //console.log("all filename: " + res.filename)

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
  move_data.new_path_val = '../'+move_data.new_path_val
  res.filename = "../data/" + req.params[0]
  console.log("lets move: " + move_data.file_name + " from "+ res.filename + "  to  " + move_data.new_path_val)

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
          console.log("move ok")
          req.flash("success", "Files renamed. ");
          res.redirect("back");
        })
        .catch((err) => {
          console.warn(err);
          req.flash("error", "Unable to rename some files: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});


app.post('/data/*@upload', function(req, res) {
  let file_path = req.url.replace("@upload",'')

  let sampleFile;
  let uploadPath;

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.');
  }

  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  sampleFile = req.files.file;
  uploadPath = '../'+file_path + sampleFile.name;

  // Use the mv() method to place the file somewhere on your server
  sampleFile.mv(uploadPath, function(err) {
    if (err)
      return res.status(500).send(err);

    res.redirect("back");
  });
});

app.post("/data/*@mkdir", (req, res) => {
  res.filename = "../data/" + req.params[0];

  //let folder = req.body.folder;
  let folder= JSON.parse(Object.keys(req.body)[0]).folder_name

  console.log("lets make directory " + res.filename + folder)
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
      console.log("Folder exists, cannot overwrite. ")
      req.flash("error", "Folder exists, cannot overwrite. ");
      res.redirect("back");
    })
    .catch((err) => {
      fs.mkdir(relative(res.filename, folder), (err) => {
        if (err) {
          console.warn(err);
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
  console.log("filename to delet: " + res.filename + delete_data.del_name_val)

  //let files = JSON.parse(req.body.files);
  let files = [delete_data.del_name_val]
  if (!files || !files.map) {
    console.log("error", "No files selected.");
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
                console.log("del failed");
                return reject(err);
              }
              resolve();
            });
          }
        });
      });
      Promise.all(promises)
        .then(() => {
          console.log("success", "Files deleted. ");
          req.flash("success", "Files deleted. ");
          res.redirect("back");
        })
        .catch((err) => {
          console.warn(err);
          req.flash("error", "Unable to delete some files: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.get("/*@download", (req, res) => {
  res.filename = req.params[0];

  let files = null;
  try {
    files = JSON.parse(req.query.files);
  } catch (e) {}
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
        console.warn(err);
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
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

app.post("/data/*@rename", (req, res) => {
  const rename_data = JSON.parse(Object.keys(req.body)[0])
  //res.filename = req.params[0];
  console.log("lets rename: " + rename_data.old_name_val + "  to  " + rename_data.new_name_val)
  console.log("filename: " + res.filename)
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
          console.log("rename ok")
          req.flash("success", "Files renamed. ");
          res.redirect("back");
        })
        .catch((err) => {
          console.warn(err);
          req.flash("error", "Unable to rename some files: " + err);
          res.redirect("back");
        });
    })
    .catch((err) => {
      console.warn(err);
      req.flash("error", err.toString());
      res.redirect("back");
    });
});

const shellable = process.env.SHELL != "false" && process.env.SHELL;
const cmdable = process.env.CMD != "false" && process.env.CMD;
if (shellable || cmdable) {
  const shellArgs = process.env.SHELL.split(" ");
  const exec = process.env.SHELL == "login" ? "/usr/bin/env" : shellArgs[0];
  const args = process.env.SHELL == "login" ? ["login"] : shellArgs.slice(1);

  const child_process = require("child_process");

  app.post("/*@cmd", (req, res) => {
    res.filename = req.params[0];

    let cmd = req.body.cmd;
    if (!cmd || cmd.length < 1) {
      return res.status(400).end();
    }
    console.log("running command " + cmd);

    child_process.exec(
      cmd,
      {
        cwd: relative(res.filename),
        timeout: 60 * 1000,
      },
      (err, stdout, stderr) => {
        if (err) {
          console.log("command run failed: " + JSON.stringify(err));
          req.flash("error", "Command failed due to non-zero exit code");
        }
        res.render(
          "cmd",
          flashify(req, {
            path: res.filename,
            cmd: cmd,
            stdout: stdout,
            stderr: stderr,
          })
        );
      }
    );
  });

  const pty = require("node-pty");
  const WebSocket = require("ws");

  // app.get("/*@shell", (req, res) => {
  //   res.filename = req.params[0];

  //   res.render(
  //     "shell",
  //     flashify(req, {
  //       path: res.filename,
  //     })
  //   );
  // });

  const ws = new WebSocket.Server({ server: http });
  ws.on("connection", (socket, request) => {
    const { path } = querystring.parse(request.url.split("?")[1]);
    let cwd = relative(path);
    let term = pty.spawn(exec, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 30,
      cwd: cwd,
    });
    console.log(
      "pid " + term.pid + " shell " + process.env.SHELL + " started in " + cwd
    );

    term.on("data", (data) => {
      socket.send(data, { binary: true });
    });
    term.on("exit", (code) => {
      console.log("pid " + term.pid + " ended");
      socket.close();
    });
    socket.on("message", (data) => {
      // special messages should decode to Buffers
      if (data.length == 6) {
        switch (data.readUInt16BE(0)) {
          case 0:
            term.resize(data.readUInt16BE(1), data.readUInt16BE(2));
            return;
        }
      }
      term.write(data);
    });
    socket.on("close", () => {
      term.end();
    });
  });
}

const SMALL_IMAGE_MAX_SIZE = 5750 * 1024; // 5750 KB

function isimage(f) {
  for (const ext of EXT_IMAGES) {
    if (f.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

app.get("/", (req, res) => {
  //console.log('curent page is:' + configAndStatus.net.DHCP);
  //console.log('status error'+res.stats.error)
  let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
  res.render("home",{
    pageName: "home",
    config: config
  });
});

//----------------SCHEDULER------------------------------

app.get("/Scheduler", (req, res) => {
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata); 
  //console.log(JSON.stringify(tasks,null,2))
  rawdata = fs.readFileSync('../meta/playlist-table.json');
  let playlist_table = JSON.parse(rawdata); 
  //console.log(JSON.stringify(playlist_table,null,2))
  //
  res.render("scheduler",{
    pageName: "Scheduler",
    tasks: tasks,
    playlist_table: playlist_table
  });
});

app.post("/Scheduler/delete", (req, res) => {
  const task_to_delete = JSON.parse(Object.keys(req.body)[0])
  console.log('task index to delete ' + task_to_delete.index_to_delete)
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  tasks.splice(task_to_delete.index_to_delete-1,1)
  console.log(tasks)
  fs.writeFileSync('../meta/scheduler-table.json', JSON.stringify(tasks,null,2))

  return res.end('done')
});

app.post("/Scheduler/edit", (req, res) => {
  const task_to_edit = JSON.parse(Object.keys(req.body)[0])
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  console.log("Change index " + (task_to_edit.index-1) + " edit from " + tasks[(task_to_edit.index-1)].name + " to " + task_to_edit.name)

  tasks[(task_to_edit.index-1)].name = task_to_edit.name
  tasks[(task_to_edit.index-1)].path = task_to_edit.path
  tasks[(task_to_edit.index-1)].type = task_to_edit.type
  tasks[(task_to_edit.index-1)].start_time = task_to_edit.start_time
  tasks[(task_to_edit.index-1)].end_time = task_to_edit.end_time
  tasks[(task_to_edit.index-1)].day_of_week = task_to_edit.day_of_week

  let data = JSON.stringify(tasks,null,2)
  fs.writeFileSync('../meta/scheduler-table.json', data)

  return res.end('done')
});

app.post("/Scheduler/new", (req, res) => {
  const new_task = JSON.parse(Object.keys(req.body)[0])
  let rawdata = fs.readFileSync('../meta/scheduler-table.json');
  let tasks = JSON.parse(rawdata);

  tasks.push(new_task)

  let data = JSON.stringify(tasks,null,2)
  fs.writeFileSync('../meta/scheduler-table.json', data)

  return res.end('done')
});


//----------------FILE MANAGER------------------------------
app.get("/data*", (req, res) => {
  if (res.stats.error) {
    console.log("Error : " + res.stats.error);
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
        //console.log(filenames);
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
                  console.warn(err);
                  return resolve({
                    name: f,
                    error: err,
                  });
                }
                resolve({
                  name: f,
                  type: file_tools.check_type(f,stats),
                  //issmallimage: isimage(f) && stats.size < SMALL_IMAGE_MAX_SIZE,
                  size: stats.size,
                });
              });
            })
        );

        Promise.all(promises)
          .then((files) => {
            files.sort(function(a, b) {
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
                dDirs: file_tools.scanDirs('../data')
              })
            );
            //console.log('render list')
          })
          .catch((err) => {
            console.error(err);
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
        console.warn(err);
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
  res.render("editor",{
    pageName: 'Editor',
    playlist_table: playlist_table,
    content_table: content_table
  });
});

app.get("/get_playlist*",(req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const path = '../'+req.url.split('?').slice(-1)[0]
  //console.log("GET PATH PLAYLIST: "+ path)
  let playlist = JSON.parse(fs.readFileSync(path))
  let content_table = JSON.parse(fs.readFileSync('../meta/content-table.json'))
  //console.log ("get playlist name: " + JSON.stringify(playlist.playlist_name))
  res.send({
    playlist: playlist,
    content_table: content_table 
  })
});

app.post("/save_playlist*",(req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])
  var path ='../'+ inData.path 
  const playlist = inData.playlist
  // const path = req.url.split('?').slice(-1)[0]
  let scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
  let playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))
  let playlistIndex = playlist_table.findIndex(s=>s.path==inData.path)
  if (playlistIndex<0){
    console.log("Add new playlist name: "+ playlist.playlist_name)
    playlist_table.push({
      name: playlist.playlist_name,
      path: inData.path,
      type: 'multimedia'
    })
    playlistIndex = playlist_table.length-1
  }else{

    if(inData.path.split('/').slice(-1)!=playlist.playlist_name){
      if (fs.existsSync(path)) {
        fs.unlink(path,(err => {
          if (err) console.log(err);
        }))
      }

      const new_path =  'data/playlists/'+playlist.playlist_name+".json"
      scheduler_table.forEach(item =>{
        if(item.path==playlist_table[playlistIndex].path){
          item.path = new_path
          }
      })

      playlist_table[playlistIndex].path = new_path
      playlist_table[playlistIndex].name = playlist.playlist_name
      path = '../'+playlist_table[playlistIndex].path
      console.log(`rename playlist name OK`)
    }
  }

  fs.writeFileSync(('../meta/scheduler-table.json'), JSON.stringify(scheduler_table,null,2))
  fs.writeFileSync(('../meta/playlist-table.json'), JSON.stringify(playlist_table,null,2))
  
  //console.log("Save PLAYLIST:"+ JSON.stringify(inData,null,2)+" path: "+path)
  fs.writeFileSync((path), JSON.stringify(playlist,null,2))

  return res.end('done')
});

app.post("/delete_playlist*",(req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])

  console.log(`Delete name: ${inData.name_to_delete} on index: ${inData.index_to_delete}`)
  // const path = req.url.split('?').slice(-1)[0]
  

  let playlist_table = JSON.parse(fs.readFileSync('../meta/playlist-table.json'))

  const path ='../'+playlist_table[inData.index_to_delete-1].path

  let scheduler_table = JSON.parse(fs.readFileSync('../meta/scheduler-table.json'))
  //console.log(`before------------------- \n${JSON.stringify(scheduler_table,null,2)}`);
  scheduler_table = scheduler_table.filter(task => task.path!=playlist_table[inData.index_to_delete-1].path)
  //console.log(`after------------------- \n${JSON.stringify(scheduler_table,null,2)}`);
  fs.writeFileSync(('../meta/scheduler-table.json'), JSON.stringify(scheduler_table,null,2))

  playlist_table.splice(inData.index_to_delete-1,1) 
  fs.writeFileSync(('../meta/playlist-table.json'), JSON.stringify(playlist_table,null,2))

  
  
  console.log("Delete PLAYLIST: "+ JSON.stringify(inData,null,2)+" path: "+path)
  //fs.writeFileSync((path), JSON.stringify(playlist,null,2))
  if (fs.existsSync(path)) {
    fs.unlink(path, (err => {
      if (err) console.log(err);
      else {
        console.log("Deleted OK");
      }
    }))
  }

  return res.end('done')
});


//----------------SETTINGS------------------------------
app.get("/Settings", (req, res) => {
  let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))

  //
  res.render("settings",{
    pageName: 'Settings',
    config: config,
  });
});

app.post("/save_config",(req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])

  try{
    fs.writeFileSync('../meta/player_config.json', JSON.stringify(inData,null,2))
    console.log(`Config save OK`)
  }catch(err){
    console.warn(`Write config error: ${err}`)
  }

  return res.end('done')
});


//----------------System------------------------------
app.get("/get_time",(req, res) => {
  let date_ob = new Date();

  res.send({
    h: date_ob.getHours(),
    m: date_ob.getMinutes() 
  })
});

app.get("/get_date",(req, res) => {
  let date_ob = new Date();

  res.send({
    d: date_ob.getDay(),
    m: date_ob.getMonth(),
    y: date_ob.getFullYear()
  })
});

app.post("/set_time",(req, res) => {
  //const playlist = JSON.parse(Object.keys(req.body)[0])
  const inData = JSON.parse(Object.keys(req.body)[0])
  console.log(`input time: ${inData.time} date: ${inData.date}`)

  exec(`date -s '${inData.date} ${inData.time}'`, (error, stdout, stderr) => {
    if (error) {
      console.warn(error)
    }
    console.log(`Set time: '${inData.date} ${inData.time}' resault ${stdout}`)
  })

  try{
    let config = JSON.parse(fs.readFileSync('../meta/player_config.json'))
    config.time.NTP = '0'
    fs.writeFileSync('../meta/player_config.json', JSON.stringify(config,null,2))
  }catch(err){
    console.warn(`Write ntp config error: ${err}`)
  }
  return res.end('done')
});

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(error)
      }
      //console.log(`sudo exec: ${cmd} resault ${stdout}`)
      resolve(stdout? stdout : stderr);
    })
  })
 }

app.get("/get_system_status",(req, res) => {
  try{
    var osu = require('node-os-utils')
    var cpu = osu.cpu
    var drive = osu.drive
    var mem = osu.mem
    let status
    Promise.all([
      cpu.usage(),
      drive.info(),
      mem.info(),
      execPromise(`cat /etc/armbianmonitor/datasources/soctemp`)
    ]).then(responses =>{
      //console.log(JSON.stringify(responses, null,2))

      status={
        cpu_load: responses[0],
        ram_usage: `${parseFloat(responses[2].usedMemMb/1000).toFixed(1)}/${parseFloat(responses[2].totalMemMb/1000).toFixed(1)}`,
        hdd_usage: `${responses[1].usedGb}/${responses[1].totalGb}`,
        soc_temp: Math.round(parseInt(responses[3])/1000)
      }

      res.send({
        status:status
      })
    })
  }catch{}  
  
});


// fs.readdir('../data/playlists', function(err, list){
//   if (err) return done(err);
//     //------to-do-------chek playlist table---------------------
// })

console.log(`Listening on port ${port}`);

//console.log(os.cpus());
//console.log(os.totalmem());
//console.log(os.freemem())
