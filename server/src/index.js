// Imports
import express from 'express';
import dotenv from 'dotenv';
import { MongoMemoryServer } from 'mongodb-memory-server';
import path from 'path';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import winston from 'winston';
import passport from 'passport';
import session from 'express-session';
import LocalStrategy from 'passport-local';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import { register } from './controllers/auth.js';
import { User } from './models/User.js';

// Load environment variables
dotenv.config();

// Configurations
const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
const app = express();

// Logger setup
const logger = winston.createLogger({
  level: 'error',
  transports: [new winston.transports.Console()],
});

// Error logging middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  next(err);
});

// Middleware setup
app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
app.use(morgan('common'));
app.use(express.json({ limit: '30mb', extended: true }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));
app.use(cors());
app.use(cookieParser(process.env.SECRET));
app.use(
  session({
    resave: true,
    saveUninitialized: true,
    secret: process.env.SECRET,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// File storage setup
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'storage/');
  },
  filename(req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

// Passport setup
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Routes
app.post('/api/auth/register', upload.single('picture'), register);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// Initialize the development environment
async function initDev() {
  if (process.env.NODE_ENV === 'development') {
    const mongodbDev = await MongoMemoryServer.create({
      instance: {
        port: 27017,
        dbName: 'rebound',
        dbPath: './mongod/',
        auth: false,
      },
      binary: {
        version: '6.0.4',
      },
    });
    await mongodbDev.stop();
    await mongodbDev.start(true);
    return mongodbDev;
  } else {
    return null;
  }
}

// Start the server
async function startServer() {
  const mongodbDev = await initDev();

  // Mongoose setup
  const PORT = process.env.PORT || 6001;
  let connectString = 'mongodb://localhost:27017/';
  let extraParams = {};
  if (process.env.NODE_ENV === 'development') {
    connectString = mongodbDev.getUri();
    console.log('Connection String:', connectString);
  } else {
    extraParams = {
      user: process.env.DB_USER,
      pass: process.env.DB_PASS,
      authSource: 'admin',
    };
  }
  await mongoose.set('strictQuery', true);
  await mongoose.connect(`${connectString}rebound?w=majority`, {
    retryWrites: true,
    retryReads: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
    ...extraParams,
  });

  // Start listening for incoming requests
  app.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
  });
}

// Call the startServer function to initialize the server
startServer();