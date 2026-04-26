const mongoose = require("mongoose");
const dotenv = require("dotenv");

const { updateFileSystemInDB } = require("../services/fs");
const FileSystem = require("../models/FileSystem.model");

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

const refreshDB = async () => {
  await FileSystem.collection.drop();
  // console.log('FileSystem dropped.');

  const tree = await updateFileSystemInDB();
};

module.exports = {connectDB, refreshDB};
