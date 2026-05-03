// src/app.js
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { requestLogger } from './middleware/requestLogger.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { sanitizeInput } from './middleware/sanitizer.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import subjectRoutes from './routes/subject.routes.js';
import testRoutes from './routes/test.routes.js';
import adminRoutes from './routes/admin.routes.js';
import progressRoutes from './routes/progress.routes.js';
import tutorRoutes    from './routes/tutor.routes.js';
import mediaRoutes    from './routes/media.routes.js';
import commonRoutes   from './routes/common.routes.js';
import systemRoutes   from './routes/system.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const isDev = process.env.NODE_ENV === 'development';

// ─── 1. TRUST PROXY ──────────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── 2. COOKIE PARSER ────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── 3. HELMET ───────────────────────────────────────────────────────────────
if (isDev) {
  app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
} else {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
}

// ─── 4. CORS ─────────────────────────────────────────────────────────────────
const allowedOrigins = isDev
  ? ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:3000']
  : [process.env.FRONTEND_URL].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 600,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// ─── 5. LOGGING ──────────────────────────────────────────────────────────────
if (isDev) app.use(morgan('dev'));
app.use(requestLogger);

// ─── 6. BODY PARSING ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── 7. SANITIZATION ─────────────────────────────────────────────────────────

app.use(sanitizeInput);
app.use(hpp({ whitelist: ['sort', 'fields', 'page', 'limit', 'search'] }));

// ─── 8. RATE LIMITING ────────────────────────────────────────────────────────
if (!isDev) {
  app.use('/api/', rateLimiter);
}

// ─── 9. HEALTH CHECK ─────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    environment: process.env.NODE_ENV || 'development',
    node: process.version
  });
});

// ─── 9.5 STATIC FILES ────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));


// ─── 10. ROUTES ──────────────────────────────────────────────────────────────
// Note: protect is NOT applied here — each route file calls router.use(protect)
// internally. Applying it twice would be redundant and confusing.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/tests', testRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use('/api/v1/tutor',    tutorRoutes);
app.use('/api/v1/media',    mediaRoutes);
app.use('/api/v1/common',   commonRoutes);
app.use('/api/v1/admin/system', systemRoutes);


// ─── 11. ERROR HANDLERS ──────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;