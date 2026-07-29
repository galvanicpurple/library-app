import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Rate limiting configuration
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many authentication attempts, please try again later',
  skipSuccessfulRequests: true,
});

// Rate limiting for file uploads/scanning
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  message: 'Too many uploads, please try again later',
});

// Configure helmet for security headers
export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  xssFilter: true,
  noSniff: true,
  ieNoOpen: true,
  hidePoweredBy: true,
});

// CORS configuration
export const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')
      : ['http://localhost:5173'];
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Request logging middleware (for security auditing)
export const requestLogger = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const { method, originalUrl, ip } = req;
  const userId = req.user?.id || 'anonymous';
  
  console.log(`[${timestamp}] ${method} ${originalUrl} - IP: ${ip} - User: ${userId}`);
  
  next();
};

// File upload security
export const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ 
      error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed' 
    });
  }

  if (req.file.size > maxSize) {
    return res.status(400).json({ 
      error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB` 
    });
  }

  next();
};

// Prevent common attacks
export const securityMiddleware = [
  helmetConfig,
  requestLogger,
];
