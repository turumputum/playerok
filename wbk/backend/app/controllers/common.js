const path = require("path");
const fs = require("fs");
const { FS_ROOT } = require('../services/fs');
const FileSystem = require("../models/FileSystem.model");

const deleteRecursiveFromDB = async (item) => {
  const children = await FileSystem.find({ parentId: item._id });

  for (const child of children) {
    await deleteRecursiveFromDB(child);
  }

  await FileSystem.findByIdAndDelete(item._id);
};

const deleteFile = async (file) => {
  const filePath = path.join(FS_ROOT, file.path);
  await fs.promises.rm(filePath, { recursive: true });

  await deleteRecursiveFromDB(file);
}

module.exports = {
  deleteRecursiveFromDB,
  deleteFile,
};
