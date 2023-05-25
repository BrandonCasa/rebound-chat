// Required packages
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const logger = require('./logging/logger');
const cors = require('cors');
const fs = require('fs');

// Require routes
const authRoutes = require('./routes/auth');

// Load environment variables
require('dotenv').config();

// Start new MongoMemoryServer only in development environment

let mongoServer;
if (process.env.NODE_ENV === 'development') {
  if (!fs.existsSync("./dev")) {
    fs.mkdirSync("./dev");
  }
  mongoServer = new MongoMemoryServer({
    instance: {
      port: 27017,
      dbPath: 'dev',
    }
  });
}

// Use Multer for file handling
const upload = multer({ dest: 'uploads/' });

// Initialize express
const app = express();

app.use(cors());

// Connect to MongoDB
(async () => {
  let mongoUri;
  const mongooseOpts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };

  if (process.env.NODE_ENV === 'development') {
    // Use in-memory mongoDB
    await mongoServer.start(true)
    mongoUri = await mongoServer.getUri();
  } else {
    // Use local mongoDB server
    mongoUri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@localhost:27017/${process.env.DB_NAME}?authSource=${process.env.DB_AUTH}`;
  }

  mongoose.connect(mongoUri, mongooseOpts);

  mongoose.connection.on('error', (e) => {
    if (e.message.code === 'ETIMEDOUT') {
      logger.error(e);
      mongoose.connect(mongoUri, mongooseOpts);
    }
    logger.error(e);
  });

  mongoose.connection.once('open', () => {
    logger.info(`MongoDB successfully connected to ${mongoUri}`);
  });
})();

// Middleware for body parsing
app.use(express.json());

// Apply helmet middleware to set secure HTTP headers
app.use(helmet());

// Create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
  write: function (message, encoding) {
    // Use the 'info' log level so the output will be picked up by both transports
    logger.info(message);
  },
};

// Then use morgan middleware with the stream of winston
app.use(morgan('combined', { stream: logger.stream }));

// Create a test endpoint for file upload
//app.post('/api/upload', upload.single('file'), (req, res) => {
//  res.json({ file: req.file });
//});

// Verify token endpoint
app.get('/api/auth/verify', (req, res) => {
  const valid = jwt.verify(req.headers.authorization, process.env.SECRET);
  res.send(valid);
});


// Middleware for routes
app.use('/api/auth', authRoutes);

// Start server
app.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  if (process.env.NODE_ENV === 'development') {
    await mongoServer.stop();
  }
  process.exit();
});