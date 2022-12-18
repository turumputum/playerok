const EXT_IMAGES = [".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".tiff"];
const EXT_VIDEO = [".mp4", ".avi", ".mkv"];
const EXT_SOUND = [".mp3", ".wav"];
const EXT_SCRIPT = [".py", ".sh"];
const EXT_JSON = [".json"];

const dirTree = require('directory-tree');

function flatFilter(nestedProp, editProp, compareKey, compareId, arr) {
  return arr.filter(o => {
    const keep = o[compareKey] != compareId;
    if (keep && (o[nestedProp] || o[editProp])) {
      
      o[nestedProp] = flatFilter(nestedProp, editProp, compareKey, compareId, o[nestedProp]);
      o[editProp] = o[nestedProp]
      delete o[nestedProp]
      
      if(o[editProp].length==0){
        delete o[editProp]
      }

    }
    //console.log('try insert icon')
    

    o["text"]=o["name"]
    delete o["name"]

    return keep;
  });
}


module.exports = {
  check_type: function (f,stats) {
    try{
      if (stats.isDirectory()){
        return 'dir';
      }
    }catch{}

    for (const ext of EXT_IMAGES) {
      if (f.endsWith(ext)) {
        return 'pic';
      }
    }

    for (const ext of EXT_VIDEO) {
      if (f.endsWith(ext)) {
        return 'video';
      }
    }

    for (const ext of EXT_SOUND) {
      if (f.endsWith(ext)) {
        return 'sound';
      }
    }

    for (const ext of EXT_SCRIPT) {
      if (f.endsWith(ext)) {
        return 'script';
      }
    }

    for (const ext of EXT_JSON) {
      if (f.endsWith(ext)) {
        return 'json';
      }
    }

    return 'other';
  },
  scanDirs: function(path){
    const tree = dirTree(path,{attributes:['type']})
    const dat = tree.children
    //console.log(JSON.stringify( dat,null,2))
    const rdat = flatFilter("children","nodes", "type", "file", dat)
    let outDat =[{
      "path":"data",
      "text":"data",
      "type": "directory",
      "nodes": rdat
    }]

    //console.log(JSON.stringify(outDat,null,2))
    return outDat
  }

};