// Required packages
const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Start new MongoMemoryServer only in development environment
let mongoServer;
if (process.env.NODE_ENV === 'development') {
  mongoServer = new MongoMemoryServer();
}

// Setup winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Use Multer for file handling
const upload = multer({ dest: 'uploads/' });

// Initialize express
const app = express();

// Connect to MongoDB
(async () => {
  let mongoUri;
  const mongooseOpts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };

  if (process.env.NODE_ENV === 'development') {
    // Use in-memory mongoDB
    await mongoServer.start()
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

// Apply Morgan middleware for logging HTTP requests
app.use(morgan('combined', { stream: winston.stream }));

// Create a test endpoint for file upload
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ file: req.file });
});

// Test endpoint for JWT
app.get('/jwt', (req, res) => {
  const token = jwt.sign({ user: 'username' }, 'your_secret_key', { expiresIn: '1h' });
  res.json({ token: token });
});

// Start server
app.listen(process.env.PORT, () => logger.info(`Server started on port ${process.env.PORT}`));

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  if (process.env.NODE_ENV === 'development') {
    await mongoServer.stop();
  }
  process.exit();
});