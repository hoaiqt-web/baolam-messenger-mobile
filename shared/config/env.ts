// In React Native/Expo we use EXPO_PUBLIC_ prefix for env vars
// Production: Railway backend
const defaultHost = "baolam-erp-backend.up.railway.app";
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || `https://${defaultHost}/api`;
const reverbKey = process.env.EXPO_PUBLIC_REVERB_APP_KEY || "d24622c05d8efde0689ab3f064056e7c";
const reverbScheme = process.env.EXPO_PUBLIC_REVERB_SCHEME || "https";
const reverbHost = process.env.EXPO_PUBLIC_REVERB_HOST || defaultHost;
const configuredReverbPort = Number(process.env.EXPO_PUBLIC_REVERB_PORT || "443");
const reverbPort = Number.isFinite(configuredReverbPort) && configuredReverbPort > 0
  ? configuredReverbPort
  : reverbScheme === "https"
    ? 443
    : 8080;
const chatLatencyEnabled = String(process.env.EXPO_PUBLIC_CHAT_LATENCY_ENABLED || "false").toLowerCase() === "true";

export const env = {
  apiBaseUrl,
  reverbKey,
  reverbHost,
  reverbPort,
  reverbScheme,
  chatLatencyEnabled,
};
