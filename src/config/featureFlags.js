import { FeatureFlag } from '../models/FeatureFlag.js';

// In-memory cache
let flagsCache = {};
let lastFetch = 0;
const CACHE_TTL = 30000; // 30 seconds

const envBool = (value, defaultValue = true) => {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
};

const defaults = {
  FEATURE_ENABLE_REGISTRATION: envBool(process.env.FEATURE_ENABLE_REGISTRATION, true),
  FEATURE_ENABLE_LOGIN: envBool(process.env.FEATURE_ENABLE_LOGIN, true),
  FEATURE_ENABLE_CHAT: envBool(process.env.FEATURE_ENABLE_CHAT, true),
  FEATURE_ENABLE_REACTIONS: envBool(process.env.FEATURE_ENABLE_REACTIONS, true),
  FEATURE_ENABLE_CHAT_REQUESTS: envBool(process.env.FEATURE_ENABLE_CHAT_REQUESTS, true),
};

export async function refreshFeatureFlags() {
  try {
    const flags = await FeatureFlag.find({});
    const newCache = { ...defaults };
    flags.forEach(f => {
      newCache[f.key] = f.enabled;
    });
    flagsCache = newCache;
    lastFetch = Date.now();
    console.log('Feature flags refreshed from DB');
  } catch (e) {
    console.error('Failed to refresh feature flags', e);
  }
}

// Initial load
setTimeout(refreshFeatureFlags, 1000);

export function getFeatureFlags() {
  // If cache empty, return defaults (or wait? synchronous return required here usually)
  // We return cache mixed with defaults
  return { ...defaults, ...flagsCache };
}

