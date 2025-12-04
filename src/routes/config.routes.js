import express from 'express';
import { getFeatureFlags } from '../config/featureFlags.js';

export const featureFlagsRouter = express.Router();

featureFlagsRouter.get('/feature-flags', (req, res) => {
  const flags = getFeatureFlags();
  res.json(flags);
});
