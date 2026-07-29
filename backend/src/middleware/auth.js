import jwt from 'jsonwebtoken';
import { query } from '../db/db.js';

// Verify JWT token and attach user to request
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists and is active
    const result = await query(
      'SELECT id, email, full_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Attach user to request object (without sensitive data)
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT id, email, full_name FROM users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );

      if (result.rows.length > 0) {
        req.user = {
          id: result.rows[0].id,
          email: result.rows[0].email,
          fullName: result.rows[0].full_name
        };
      }
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Check if user owns a resource
export const authorizeResource = (resourceUserIdField = 'user_id') => {
  return async (req, res, next) => {
    try {
      const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
      
      if (resourceUserId && resourceUserId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this resource' });
      }
      
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ error: 'Authorization failed' });
    }
  };
};
