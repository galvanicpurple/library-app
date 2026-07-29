import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBook, FaEnvelope, FaLock } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import './Auth.css';

const Login = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (formError) setFormError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setLoading(true);

    try {
      const response = await authAPI.login(formData);
      const { user, token } = response.data;

      setAuth(user, token);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      const message = error.response?.data?.error || 'Login failed';
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <FaBook className="auth-icon" />
          <h1>Welcome Back</h1>
          <p>Sign in to your library</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {formError && <div className="form-error">{formError}</div>}

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
              className="input"
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
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
