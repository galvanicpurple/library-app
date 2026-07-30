import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { securityMiddleware, corsOptions, generalLimiter } from './middleware/security.js';
import authRoutes from './routes/auth.js';
import booksRoutes from './routes/books.js';
import shelvesRoutes from './routes/shelves.js';
import readingsRoutes from './routes/readings.js';
import scanRoutes from './routes/scan.js';
import recommendationsRoutes from './routes/recommendations.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust exactly one reverse-proxy hop (Railway, and most PaaS hosts) so
// express-rate-limit can correctly read the real client IP from
// X-Forwarded-For instead of throwing/misidentifying every request.
app.set('trust proxy', 1);

// Security middleware (helmet, logging)
app.use(securityMiddleware);

// CORS configuration
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', generalLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/shelves', shelvesRoutes);
app.use('/api/readings', readingsRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/recommendations', recommendationsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      error: 'File too large', 
      maxSize: process.env.MAX_FILE_SIZE 
    });
  }
  
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // Database errors
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({ error: 'Database constraint violation' });
  }

  // Default error
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Library App Backend Server Started   ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                           
║  Environment: ${process.env.NODE_ENV || 'development'}       
║  Base URL: http://localhost:${PORT}     
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

export default app;
