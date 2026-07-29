import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaBook, FaHome, FaCamera, FaBookmark, FaLightbulb, FaUser, FaSignOutAlt } from 'react-icons/fa';
import useAuthStore from '../../store/authStore';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: FaHome, label: 'Dashboard' },
    { path: '/library', icon: FaBook, label: 'Library' },
    { path: '/shelves', icon: FaBookmark, label: 'Shelves' },
    { path: '/scan', icon: FaCamera, label: 'Scan' },
    { path: '/recommendations', icon: FaLightbulb, label: 'Recommendations' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <FaBook className="brand-icon" />
          <span className="brand-name">LibraryApp</span>
        </div>

        <div className="navbar-menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="navbar-user">
          <Link to="/profile" className="user-link">
            <FaUser className="user-icon" />
            <span className="user-name">{user?.fullName || 'User'}</span>
          </Link>
          <button onClick={handleLogout} className="logout-btn" title="Logout">
            <FaSignOutAlt />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
