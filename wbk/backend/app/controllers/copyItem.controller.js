const FileSystem = require("../models/FileSystem.model");
const fs = require("fs");
const mongoose = require("mongoose");
const path = require("path");
const { FS_ROOT } = require("../services/fs");
const { deleteFile } = require("./common.js");

const recursiveCopy = async (sourceItem, destinationFolder) => {
  const copyItem = new FileSystem({
    name: sourceItem.name,
    isDirectory: sourceItem.isDirectory,
    path: `${destinationFolder?.path ?? ""}/${sourceItem.name}`,
    parentId: destinationFolder?._id || null,
    size: sourceItem.size,
    mimeType: sourceItem.mimeType,
  });

  await copyItem.save();

  const children = await FileSystem.find({ parentId: sourceItem._id });

  for (const child of children) {
    await recursiveCopy(child, copyItem);
  }
};

const copyItem = async (req, res) => {
  // #swagger.summary = 'Copies file/folder(s) to the destination folder.'
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: { $ref: "#/definitions/CopyItems" },
        description: 'An array of item IDs to copy and the destination folder ID.'
      }
  */
  /*  #swagger.responses[200] = {
        schema: {message: "Item(s) copied successfully!"}
      }
  */

  const { sourceIds, destinationId, overwrite } = req.body;
  const isRootDestination = !destinationId;

  if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
    return res.status(400).json({ error: "Invalid request body, expected an array of sourceIds." });
  }

  try {
    const validIds = sourceIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== sourceIds.length) {
      return res.status(400).json({ error: "One or more of the provided sourceIds are invalid." });
    }

    let destinationFolder = { path: '' };
    if (!isRootDestination) {
      destinationFolder = await FileSystem.findById(destinationId);
      // console.log({destinationFolder});
      if (!destinationFolder)
        throw new Error(`Wrong destinationId: ${ destinationId }`);
    }

    const sourceItems = await FileSystem.find({ _id: { $in: validIds } });
    if (sourceItems.length !== validIds.length) {
      return res.status(404).json({ error: "One or more of the provided sourceIds do not exist." });
    }

    // CHECK FOR EXISTENCE
    const nextPathes = sourceItems.map(d => destinationFolder.path + '/' + d.name);
    // console.log({nextPathes});
    const existing = await FileSystem.find({ path: {
      $in: nextPathes,
    } });
    // console.log({existing});
    // console.log({all: (await FileSystem.find()).map(d => d.path) });
    if (!overwrite && existing.length)
      return res.status(409).json({
        error: `Pathes already exists: ${ existing.map(d => d.path) }`,
        type: 'FILES_EXIST',
      });

    if (existing.length) {
      try {
        await Promise.all(existing.map(deleteFile));
      } catch (error) {
        return res.status(500).json({ error });
      }
    }

    const copyPromises = sourceItems.map(async (sourceItem) => {
      const srcFullPath = path.join(FS_ROOT, sourceItem.path);

      if (isRootDestination) {
        const destFullPath = path.join(FS_ROOT, sourceItem.name);
        await fs.promises.cp(srcFullPath, destFullPath, { recursive: true });
        await recursiveCopy(sourceItem, null); // Destination Folder -> Root Folder
      } else {
        const destFullPath = path.join(
          FS_ROOT,
          destinationFolder.path,
          sourceItem.name
        );
        await fs.promises.cp(srcFullPath, destFullPath, { recursive: true });
        await recursiveCopy(sourceItem, destinationFolder);
      }
    });

    try {
      await Promise.all(copyPromises);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(200).json({ message: "Item(s) copied successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = copyItem;
