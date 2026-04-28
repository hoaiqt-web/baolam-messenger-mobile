import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = "chat.auth.token";
const AUTH_REFRESH_TOKEN_KEY = "chat.auth.refreshToken";

let cachedToken: string | null = null;
let cachedRefreshToken: string | null = null;

export const authStorage = {
  async init() {
    cachedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
    cachedRefreshToken = await AsyncStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  },
  getToken(): string | null {
    return cachedToken;
  },
  getRefreshToken(): string | null {
    return cachedRefreshToken;
  },
  async setToken(token: string) {
    cachedToken = token;
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  },
  async setRefreshToken(token: string) {
    cachedRefreshToken = token;
    await AsyncStorage.setItem(AUTH_REFRESH_TOKEN_KEY, token);
  },
  async setTokens(accessToken: string, refreshToken: string) {
    cachedToken = accessToken;
    cachedRefreshToken = refreshToken;
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    await AsyncStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
  },
  async clearToken() {
    cachedToken = null;
    cachedRefreshToken = null;
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    await AsyncStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  },
};
