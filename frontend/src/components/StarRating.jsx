import { FaStar } from 'react-icons/fa';
import './StarRating.css';

// Clicking the currently selected star clears the rating, which is the only
// way back to "unrated" - the API treats a null rating as "leave unchanged".
const StarRating = ({ value = 0, onChange, disabled = false }) => (
  <div className="star-rating" role="group" aria-label="Rating">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        className={`star${star <= value ? ' filled' : ''}`}
        onClick={() => onChange(star === value ? 0 : star)}
        disabled={disabled}
        aria-pressed={star <= value}
        aria-label={`${star} star${star > 1 ? 's' : ''}`}
        title={`${star} star${star > 1 ? 's' : ''}`}
      >
        <FaStar />
      </button>
    ))}
  </div>
);

export default StarRating;
