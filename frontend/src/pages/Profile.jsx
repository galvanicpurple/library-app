import { useState, useEffect } from 'react';
import { FaUser } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import './Profile.css';

const Profile = () => {
  const { user, updateUser } = useAuthStore();
  const [formData, setFormData] = useState({
    fullName: user?.fullName || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authAPI.updateProfile(formData);
      updateUser(response.data.user);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-container">
      <div className="container">
        <div className="profile-card">
          <div className="profile-header">
            <FaUser className="profile-icon" />
            <h1>Profile Settings</h1>
          </div>

          <form onSubmit={handleSubmit} className="profile-form">
            <div className="form-group">
              <label className="label">Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="input"
              />
            </div>

            <div className="form-group">
              <label className="label">Email</label>
              <input
                type="email"
                value={user?.email}
                className="input"
                disabled
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
