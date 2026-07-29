import { getRecommendations, getReadingInsights } from '../services/recommendationService.js';
import { suggestOrganization, applyOrganization } from '../services/organizationService.js';

// Get personalized recommendations
export const getUserRecommendations = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const recommendations = await getRecommendations(req.user.id, parseInt(limit));
    
    res.json({
      recommendations,
      total: recommendations.length,
    });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
};

// Get reading insights
export const getInsights = async (req, res) => {
  try {
    const insights = await getReadingInsights(req.user.id);
    
    res.json({ insights });
  } catch (error) {
    console.error('Get insights error:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
};

// Get organization suggestions
export const getOrganizationSuggestions = async (req, res) => {
  try {
    const { method = 'genre' } = req.query;
    
    const organization = await suggestOrganization(req.user.id, method);
    
    res.json({ organization });
  } catch (error) {
    console.error('Get organization suggestions error:', error);
    res.status(500).json({ error: 'Failed to generate organization suggestions' });
  }
};

// Apply organization
export const applyOrganizationSuggestion = async (req, res) => {
  try {
    const result = await applyOrganization(req.user.id, req.body);
    
    res.json({
      message: 'Organization applied successfully',
      ...result,
    });
  } catch (error) {
    console.error('Apply organization error:', error);
    res.status(500).json({ error: 'Failed to apply organization' });
  }
};
