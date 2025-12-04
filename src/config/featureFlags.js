const envBool = (value, defaultValue = true) => {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
};

export function getFeatureFlags() {
  return {
    FEATURE_ENABLE_REGISTRATION: envBool(process.env.FEATURE_ENABLE_REGISTRATION, true),
    FEATURE_ENABLE_LOGIN: envBool(process.env.FEATURE_ENABLE_LOGIN, true),
    FEATURE_ENABLE_CHAT: envBool(process.env.FEATURE_ENABLE_CHAT, true),
    FEATURE_ENABLE_REACTIONS: envBool(process.env.FEATURE_ENABLE_REACTIONS, true),
    FEATURE_ENABLE_CHAT_REQUESTS: envBool(process.env.FEATURE_ENABLE_CHAT_REQUESTS, true),
  };
}
