import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBook, FaUser, FaEnvelope, FaLock } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import './Auth.css';

const Register = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) setFormError('');
    if (e.target.name === 'email' && emailTaken) setEmailTaken(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setEmailTaken(false);

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...registerData } = formData;
      const response = await authAPI.register(registerData);
      const { user, token } = response.data;

      setAuth(user, token);
      toast.success('Registration successful!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Registration error:', error);
      const message = error.response?.data?.error || 'Registration failed';
      setFormError(message);
      if (error.response?.status === 409) {
        setEmailTaken(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <FaBook className="auth-icon" />
          <h1>Create Account</h1>
          <p>Start organizing your library</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {formError && (
            <div className="form-error">
              {formError}
              {emailTaken && (
                <>
                  {' '}
                  <Link to="/login" className="auth-link">Sign in instead</Link>
                </>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="fullName" className="label">
              <FaUser /> Full Name
            </label>
            <input
              id="fullName"
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className="input"
              placeholder="John Doe"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email" className="label">
              <FaEnvelope /> Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={`input${emailTaken ? ' input-error' : ''}`}
              placeholder="your@email.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="label">
              <FaLock /> Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="input"
              placeholder="••••••••"
              required
              minLength={8}
            />
            <small className="hint">
              Must be at least 8 characters with uppercase, lowercase, and number
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="label">
              <FaLock /> Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
