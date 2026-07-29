import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { recommendationsAPI } from '../utils/api';
import './Recommendations.css';

const Recommendations = () => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      const response = await recommendationsAPI.get({ limit: 20 });
      setRecommendations(response.data.recommendations);
    } catch (error) {
      toast.error('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="recommendations-container">
      <div className="container">
        <h1>Recommended for You</h1>
        
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="empty-state">
            <p>No recommendations yet. Start reading books to get personalized suggestions!</p>
          </div>
        ) : (
          <div className="recommendations-grid">
            {recommendations.map((rec) => (
              <div key={rec.id} className="book-card">
                {rec.image_url && <img src={rec.image_url} alt={rec.title} />}
                <div className="book-info">
                  <h3>{rec.title}</h3>
                  <p className="book-authors">{rec.authors?.join(', ')}</p>
                  <span className="badge badge-primary">{rec.recommendationType}</span>
                  <p className="recommendation-reason">{rec.reason}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Recommendations;
