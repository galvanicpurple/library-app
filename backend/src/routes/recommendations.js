import express from 'express';
import {
  getUserRecommendations,
  getInsights,
  getOrganizationSuggestions,
  applyOrganizationSuggestion,
} from '../controllers/recommendationsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Recommendations and insights
router.get('/', getUserRecommendations);
router.get('/insights', getInsights);
router.get('/organize', getOrganizationSuggestions);
router.post('/organize/apply', applyOrganizationSuggestion);

export default router;
