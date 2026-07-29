import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/db.js';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Register new user
export const register = async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password with bcrypt (salt rounds: 12)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name) 
       VALUES ($1, $2, $3) 
       RETURNING id, email, full_name, created_at`,
      [email, passwordHash, fullName]
    );

    const user = result.rows[0];

    // Create default preferences
    await query(
      'INSERT INTO user_preferences (user_id) VALUES ($1)',
      [user.id]
    );

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const result = await query(
      'SELECT id, email, password_hash, full_name, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if account is active
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

// Get current user profile
export const getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.full_name, u.created_at, u.last_login,
              up.organization_method, up.theme, up.notifications_enabled
       FROM users u
       LEFT JOIN user_preferences up ON u.id = up.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        preferences: {
          organizationMethod: user.organization_method,
          theme: user.theme,
          notificationsEnabled: user.notifications_enabled,
        },
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// Update user profile
export const updateProfile = async (req, res) => {
  try {
    const { fullName } = req.body;
    
    const result = await query(
      'UPDATE users SET full_name = $1 WHERE id = $2 RETURNING id, email, full_name',
      [fullName, req.user.id]
    );

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// Update user email (requires current password)
export const updateEmail = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;

    const result = await query(
      'SELECT id, email, password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      // 400, not 401: this is a bad-input error on an already-authenticated
      // request, not an invalid/expired session - a 401 here would trip the
      // frontend's global interceptor and log the user out of their session.
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    if (newEmail === user.email) {
      return res.status(400).json({ error: 'New email must be different from current email' });
    }

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [newEmail, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use by another account' });
    }

    const updated = await query(
      'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, full_name',
      [newEmail, req.user.id]
    );

    res.json({
      message: 'Email updated successfully',
      user: updated.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation, in case of a race condition
      return res.status(409).json({ error: 'Email already in use by another account' });
    }
    console.error('Update email error:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
};

// Update user password (requires current password)
export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      // 400, not 401: this is a bad-input error on an already-authenticated
      // request, not an invalid/expired session - a 401 here would trip the
      // frontend's global interceptor and log the user out of their session.
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, req.user.id]
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
};

// Update user preferences
export const updatePreferences = async (req, res) => {
  try {
    const { organizationMethod, theme, notificationsEnabled } = req.body;
    
    const result = await query(
      `UPDATE user_preferences 
       SET organization_method = COALESCE($1, organization_method),
           theme = COALESCE($2, theme),
           notifications_enabled = COALESCE($3, notifications_enabled)
       WHERE user_id = $4
       RETURNING *`,
      [organizationMethod, theme, notificationsEnabled, req.user.id]
    );

    res.json({
      message: 'Preferences updated successfully',
      preferences: result.rows[0],
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};
