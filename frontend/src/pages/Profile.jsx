import { useState } from 'react';
import { FaUser, FaEnvelope, FaLock } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { authAPI } from '../utils/api';
import useAuthStore from '../store/authStore';
import './Profile.css';

const Profile = () => {
  const { user, updateUser } = useAuthStore();

  const [profileData, setProfileData] = useState({ fullName: user?.fullName || '' });
  const [profileLoading, setProfileLoading] = useState(false);

  const [emailData, setEmailData] = useState({ newEmail: '', currentPassword: '' });
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);

    try {
      const response = await authAPI.updateProfile(profileData);
      updateUser(response.data.user);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');
    setEmailLoading(true);

    try {
      const response = await authAPI.updateEmail(emailData);
      updateUser(response.data.user);
      toast.success('Email updated successfully');
      setEmailData({ newEmail: '', currentPassword: '' });
    } catch (error) {
      setEmailError(error.response?.data?.error || 'Failed to update email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await authAPI.updatePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success('Password updated successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordError(error.response?.data?.error || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
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

          <form onSubmit={handleProfileSubmit} className="profile-form">
            <div className="form-group">
              <label className="label">Full Name</label>
              <input
                type="text"
                value={profileData.fullName}
                onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                className="input"
              />
            </div>

            <div className="form-group">
              <label className="label">Email</label>
              <input type="email" value={user?.email || ''} className="input" disabled />
            </div>

            <button type="submit" className="btn btn-primary" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="profile-card">
          <div className="profile-header profile-header-left">
            <FaEnvelope className="section-icon" />
            <h2>Change Email</h2>
          </div>

          <form onSubmit={handleEmailSubmit} className="profile-form">
            {emailError && <div className="form-error">{emailError}</div>}

            <div className="form-group">
              <label className="label">New Email</label>
              <input
                type="email"
                value={emailData.newEmail}
                onChange={(e) => setEmailData({ ...emailData, newEmail: e.target.value })}
                className="input"
                placeholder={user?.email}
                required
              />
            </div>

            <div className="form-group">
              <label className="label">Current Password</label>
              <input
                type="password"
                value={emailData.currentPassword}
                onChange={(e) => setEmailData({ ...emailData, currentPassword: e.target.value })}
                className="input"
                placeholder="Confirm with your current password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={emailLoading}>
              {emailLoading ? 'Updating...' : 'Update Email'}
            </button>
          </form>
        </div>

        <div className="profile-card">
          <div className="profile-header profile-header-left">
            <FaLock className="section-icon" />
            <h2>Change Password</h2>
          </div>

          <form onSubmit={handlePasswordSubmit} className="profile-form">
            {passwordError && <div className="form-error">{passwordError}</div>}

            <div className="form-group">
              <label className="label">Current Password</label>
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="input"
                required
              />
            </div>

            <div className="form-group">
              <label className="label">New Password</label>
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="input"
                minLength={8}
                required
              />
              <small className="hint">
                Must be at least 8 characters with uppercase, lowercase, and number
              </small>
            </div>

            <div className="form-group">
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="input"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
