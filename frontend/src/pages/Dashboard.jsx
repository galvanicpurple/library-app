import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaBook, FaBookmark, FaCamera, FaChartLine, FaPlus } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { booksAPI, readingsAPI, shelvesAPI, recommendationsAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import './Dashboard.css';

const Dashboard = () => {
  const user = useAuthStore((state) => state.user);
  const [stats, setStats] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch stats and recommendations in parallel
      const [booksRes, readingsRes, shelvesRes, recsRes] = await Promise.all([
        booksAPI.getAll(),
        readingsAPI.getStats(),
        shelvesAPI.getAll(),
        recommendationsAPI.get({ limit: 5 }),
      ]);

      setStats({
        totalBooks: booksRes.data.total,
        readings: readingsRes.data,
        shelves: shelvesRes.data.total,
      });

      setRecommendations(recsRes.data.recommendations);
    } catch (error) {
      console.error('Dashboard load error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="container">
        <div className="dashboard-header">
          <h1>Welcome back, {user?.fullName}!</h1>
          <p>Your personal library at a glance</p>
        </div>

        <div className="stats-grid">
          <Link to="/library" className="stat-card">
            <div className="stat-icon" style={{ background: '#dbeafe' }}>
              <FaBook style={{ color: '#2563eb' }} />
            </div>
            <div className="stat-content">
              <h3>{stats?.totalBooks || 0}</h3>
              <p>Total Books</p>
            </div>
          </Link>

          <Link to="/shelves" className="stat-card">
            <div className="stat-icon" style={{ background: '#fef3c7' }}>
              <FaBookmark style={{ color: '#f59e0b' }} />
            </div>
            <div className="stat-content">
              <h3>{stats?.shelves || 0}</h3>
              <p>Shelves</p>
            </div>
          </Link>

          <Link to="/library?status=currently_reading" className="stat-card">
            <div className="stat-icon" style={{ background: '#d1fae5' }}>
              <FaChartLine style={{ color: '#10b981' }} />
            </div>
            <div className="stat-content">
              <h3>
                {stats?.readings?.stats?.find(s => s.status === 'currently_reading')?.count || 0}
              </h3>
              <p>Currently Reading</p>
            </div>
          </Link>

          <Link to="/add" className="stat-card">
            <div className="stat-icon" style={{ background: '#e0e7ff' }}>
              <FaCamera style={{ color: '#6366f1' }} />
            </div>
            <div className="stat-content">
              <h3>{stats?.readings?.completedThisYear || 0}</h3>
              <p>Read This Year</p>
            </div>
          </Link>
        </div>

        {recommendations.length > 0 && (
          <div className="recommendations-section">
            <div className="section-header">
              <h2>Recommended for You</h2>
              <Link to="/recommendations" className="btn btn-outline">
                View All
              </Link>
            </div>

            <div className="recommendations-grid">
              {recommendations.map((rec) => (
                <div key={rec.id} className="book-card">
                  {rec.image_url && (
                    <img src={rec.image_url} alt={rec.title} className="book-cover" />
                  )}
                  <div className="book-info">
                    <h4>{rec.title}</h4>
                    <p className="book-authors">
                      {rec.authors?.join(', ') || 'Unknown Author'}
                    </p>
                    <span className="badge badge-primary">{rec.recommendationType}</span>
                    <p className="recommendation-reason">{rec.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            <Link to="/add" className="action-card">
              <FaPlus />
              <span>Add Books</span>
            </Link>
            <Link to="/library" className="action-card">
              <FaBook />
              <span>Browse Library</span>
            </Link>
            <Link to="/recommendations" className="action-card">
              <FaChartLine />
              <span>Get Recommendations</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
