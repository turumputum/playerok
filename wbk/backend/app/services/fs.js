const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const dotenv = require("dotenv");
const ignore = require("ignore");
const FileSystem = require("../models/FileSystem.model");

dotenv.config();
const indexIgnore = ignore().add(process.env.INDEX_IGNORE.split(','));

const FS_ROOT = path.resolve(process.env.FS_ROOT);

async function updateFileSystemInDB(rootPath = FS_ROOT, dirPath = '', parentId = null, listing = []) {
  const fileNames = fs.readdirSync(path.join(rootPath, dirPath));

  const savePromises = fileNames.map(async (fileName) => {
    if (indexIgnore.ignores(fileName))
      return;

    const relPath = path.join(dirPath, fileName);
    const stats = fs.statSync(path.join(rootPath, relPath));

    const isDirectory = stats.isDirectory();
    const dbItem = new FileSystem( {
      name: fileName,
      isDirectory,
      path: '/' + relPath,
      parentId,
      size: isDirectory ? null : stats.size,
      mimeType: isDirectory ? null : mime.lookup(fileName),
    } );

    await dbItem.save().catch(err => console.error({err}));
    if (!dbItem._id)
      throw 'No id: ' + dbItem.path;

    listing.push(dbItem);

    if (isDirectory) {
      await updateFileSystemInDB(rootPath, relPath, dbItem._id, listing);
    }
  });

  await Promise.all(savePromises);
  // console.log('FileSystem tree updated.');

  return listing;
}


module.exports = {
  FS_ROOT,
  updateFileSystemInDB,
  indexIgnore,
};
