const path = require("path");
const express = require("express");
const {connectDB, refreshDB} = require("./app/config/db.config");
const cors = require("cors");
const fileSystemRoutes = require("./app/routes/fileSystem.routes");
const errorHandler = require("./app/middlewares/errorHandler.middleware");
const dotenv = require("dotenv");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger-output.json");

dotenv.config();

const app = express();
const FRONTEND_ROOT = path.resolve(process.env.FRONTEND_ROOT);

process.on("unhandledRejection", (err) => {
  console.error(err);
});

// Database connection
async function init () {
  await connectDB();
  await refreshDB();

  // CORS setup
  // app.use(cors({ origin: process.env.CLIENT_URI }));
  app.use(cors({ origin: '*' }));

  // Middlewares to parse URL-encoded body & JSON
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Routes
  app.use("/api/file-system", fileSystemRoutes);

  // Swagger documentation
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // Static files serving
  app.use(express.static(FRONTEND_ROOT));
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_ROOT, 'index.html'));
  });


  // Error handling middleware
  app.use(errorHandler);

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, err => {
    if (err) return console.error(err);

    console.log(`Server running: http://localhost:${PORT}`);
  });
}
init();