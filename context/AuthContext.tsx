import React, { createContext, useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { registerIndieID, unregisterIndieDevice } from 'native-notify';

interface User {
  id: string;
  name: string;
  email: string;
  profile_picture_url: string | null;
  is_admin: boolean;
  native_notify_indie_id?: string | null;
}

interface AppData {
  id: string;
  name: string;
  logo_url: string | null;
  payment_link: string | null;
  donation_quote: string | null;
  about_church: string | null;
  city: string | null;
  state_province: string | null;
  country: string | null;
  zipcode_postalcode: string | null;
  apple_app_store_link: string | null;
  google_app_store_link: string | null;
  canAllUsersPost: boolean;
  canAllUsersComment: boolean;
  /**
   * Server-controlled rollout flag for the Groups tab. Absent/false means the
   * feature is dark-launched: the tab stays hidden and the Notifications tab
   * keeps its old place in the bar.
   */
  groups_enabled?: boolean;
  native_notify_app_id?: number;
  native_notify_app_token?: string | null;
  /**
   * Sent by newer servers only, and decided entirely by the server. The app
   * reads them and never shows `plan` to anyone.
   */
  plan?: 'free' | 'starter' | 'pro';
  /** A missing object or a missing key means that feature is on. */
  features?: Partial<ChurchFeatures> | null;
  /** True when the server lets nobody into this church. */
  locked?: boolean;
  lock_message?: string | null;
}

export interface ChurchFeatures {
  groups: boolean;
  videos: boolean;
  events: boolean;
}

interface AuthContextType {
  user: User | null;
  appData: AppData | null;
  token: string | null;
  isLoading: boolean;
  /**
   * True from the moment someone taps Log out until the next sign-in. The screen
   * that called `logout()` does the one navigation away; the signed-out guards
   * in the tabs stand aside while this is true, so they do not also navigate.
   */
  isLoggingOut: boolean;
  /** Which sections the church has. Each one is true unless the server said false. */
  features: ChurchFeatures;
  /** True when the signed-in user's church is locked. */
  locked: boolean;
  /** The server's text for a locked church, or null when it sent none. */
  lockMessage: string | null;
  login: (email: string, password: string, appId: string) => Promise<void>;
  signup: (data: { name: string; gender?: string; birth_date: string; email: string; password: string; appId: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Re-reads the church from `GET /user`. Does nothing when signed out. */
  refreshChurch: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = 'https://appmychurch.com/api/v1';
const FALLBACK_NN_APP_ID = 23936;
const FALLBACK_NN_APP_TOKEN = 'kqVaAXbDHXKd5tICC4dDQv';

/** `<platform>/<app version>`, for example `ios/1.4.0`. */
const AMC_CLIENT = `${Platform.OS}/${Constants.expoConfig?.version ?? 'unknown'}`;
const AMC_CLIENT_HEADER = 'X-AMC-Client';

/**
 * Identify this build on every request to our own API.
 *
 * `GET /user` depends on it: for a locked church the server answers 401 to a
 * client that does not send the header (which signs old versions out) and 200
 * with `app.locked` to a client that does. Without it this version would be
 * signed out instead of shown the locked screen.
 *
 * It is an interceptor limited to our API, not an axios default header, because
 * the same axios instance also calls other hosts (link previews, Native Notify).
 */
axios.interceptors.request.use((config) => {
  if (typeof config.url === 'string' && config.url.startsWith(API_URL)) {
    config.headers.set(AMC_CLIENT_HEADER, AMC_CLIENT);
  }
  return config;
});

/**
 * A church can become locked while someone is using the app. Every API route
 * then answers 403 with `code: "church_locked"`. When that happens the signed-in
 * session re-reads the church, which is what shows the locked screen, instead of
 * leaving the person looking at lists that quietly fail until the next launch.
 * The provider below sets this while someone is signed in.
 */
let onChurchLocked: (() => void) | null = null;

axios.interceptors.response.use(undefined, (error) => {
  try {
    const url = error?.config?.url;
    if (
      typeof url === 'string' &&
      url.startsWith(API_URL) &&
      error?.response?.status === 403 &&
      error.response.data?.code === 'church_locked'
    ) {
      onChurchLocked?.();
    }
  } catch {
    // Never let this get in the way of the request's own error handling.
  }
  return Promise.reject(error);
});

/** `GET /user`. The client header is also set here so this call never depends on the interceptor. */
const fetchCurrentUser = (token: string) =>
  axios.get(`${API_URL}/user`, {
    headers: { Authorization: `Bearer ${token}`, [AMC_CLIENT_HEADER]: AMC_CLIENT },
  });

/** How often, at most, returning to the foreground re-reads the church. */
const FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000;

/**
 * The church sub id this device is currently registered under.
 *
 * Persisted because the unregister that matters happens two different ways: a
 * church switch (same install, new church) and a logout after a cold start where
 * `/user` failed and `appData` is null. Both used to depend on in-memory state
 * and could silently skip the unregister, leaving the old church's pushes
 * arriving on the device.
 */
const REGISTERED_CHURCH_SUB_ID = 'nnRegisteredChurchSubId';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // The newest token, for code that outlives a render: the foreground listener,
  // and a church refresh that is still in flight when the session ends.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  // When the church was last read from `GET /user` (ms since epoch).
  const lastChurchReadAtRef = useRef(0);

  const clearStoredAuth = useCallback(async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('userData');
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    setAppData(null);
  }, []);

  useEffect(() => { loadStoredData(); }, []);

  useEffect(() => {
    const registerSubscriptions = async () => {
      const userSubId = user?.native_notify_indie_id;
      const groupSubId = appData?.id;
      if (!token || !userSubId || !groupSubId) return;

      try {
        const nnAppId = appData?.native_notify_app_id || FALLBACK_NN_APP_ID;
        const nnAppToken = appData?.native_notify_app_token || FALLBACK_NN_APP_TOKEN;

        // Switching churches on one install leaves the previous church's id
        // registered, so that church's church-wide pushes keep arriving. Take the
        // recorded id off before adding the new one.
        const previous = await AsyncStorage.getItem(REGISTERED_CHURCH_SUB_ID);
        if (previous && previous !== groupSubId) {
          try {
            await unregisterIndieDevice(previous, nnAppId, nnAppToken);
          } catch (error) {
            console.error('Failed to unregister previous church subscription:', error);
          }
        }

        // Sequential on purpose. Two concurrent registrations for the same device
        // have no guaranteed order at the vendor, and a registration that loses
        // is invisible until a push silently fails to arrive.
        await registerIndieID(userSubId, nnAppId, nnAppToken);
        await registerIndieID(groupSubId, nnAppId, nnAppToken);

        await AsyncStorage.setItem(REGISTERED_CHURCH_SUB_ID, groupSubId);
      } catch (error) {
        console.error('Native Notify registration failed:', error);
      }
    };

    registerSubscriptions();
  }, [token, user?.native_notify_indie_id, appData?.id]);

  const loadStoredData = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('accessToken');
      const storedUser = await AsyncStorage.getItem('userData');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        // Fetch full user data with app relation
        try {
          lastChurchReadAtRef.current = Date.now();
          const res = await fetchCurrentUser(storedToken);
          const fullUser = res.data;
          setUser({
            id: fullUser.id, name: fullUser.name, email: fullUser.email,
            profile_picture_url: fullUser.profile_picture_url, is_admin: fullUser.is_admin,
            native_notify_indie_id: fullUser.native_notify_indie_id,
          });
          if (fullUser.app) setAppData(fullUser.app);
        } catch (e: any) {
          if (axios.isAxiosError(e) && e.response?.status === 401) {
            await clearStoredAuth();
          } else {
            console.error('Failed to refresh user:', e);
          }
        }
      }
    } catch (error) { console.error('Failed to load auth data:', error); }
    finally { setIsLoading(false); }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      lastChurchReadAtRef.current = Date.now();
      const res = await fetchCurrentUser(token);
      const fullUser = res.data;
      const u = {
        id: fullUser.id, name: fullUser.name, email: fullUser.email,
        profile_picture_url: fullUser.profile_picture_url, is_admin: fullUser.is_admin,
        native_notify_indie_id: fullUser.native_notify_indie_id,
      };
      setUser(u);
      await AsyncStorage.setItem('userData', JSON.stringify(u));
      if (fullUser.app) setAppData(fullUser.app);
    } catch (e: any) {
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        await clearStoredAuth();
      } else {
        console.error('Refresh user error:', e);
      }
    }
  };

  /**
   * Re-reads the church (lock state, features and the rest of its data) from
   * `GET /user`. Does nothing when signed out, and a 401 ends the session the
   * same way it does everywhere else.
   */
  const refreshChurch = useCallback(async () => {
    const requestToken = tokenRef.current;
    if (!requestToken) return;
    lastChurchReadAtRef.current = Date.now();
    try {
      const res = await fetchCurrentUser(requestToken);
      // The session ended, or became someone else's, while this was in flight.
      if (tokenRef.current !== requestToken) return;
      if (res.data?.app) setAppData(res.data.app);
    } catch (e: any) {
      if (tokenRef.current !== requestToken) return;
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        await clearStoredAuth();
      } else {
        console.error('Refresh church error:', e);
      }
    }
  }, [clearStoredAuth]);

  // Pick up a church that was locked, reopened or changed while the app was in
  // the background, without a restart. Only while signed in, and no more than
  // once per interval: iOS reports 'active' again after every system prompt.
  useEffect(() => {
    if (!token) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastChurchReadAtRef.current < FOREGROUND_REFRESH_MIN_INTERVAL_MS) return;
      refreshChurch();
    });
    return () => subscription.remove();
  }, [token, refreshChurch]);

  const login = async (email: string, password: string, appId: string) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { email, password, appId });
      const { accessToken, user: userData } = response.data;
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      await AsyncStorage.setItem('appId', appId);
      setIsLoggingOut(false);
      setToken(accessToken);
      setUser(userData);
      // Fetch app data
      try {
        const appRes = await axios.get(`${API_URL}/app/${appId}`);
        setAppData(appRes.data);
      } catch {}
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  };

  const signup = async (data: { name: string; gender?: string; birth_date: string; email: string; password: string; appId: string }) => {
    try {
      const response = await axios.post(`${API_URL}/signup`, data);
      const { accessToken, user: userData } = response.data;
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      await AsyncStorage.setItem('appId', data.appId);
      setIsLoggingOut(false);
      setToken(accessToken);
      setUser(userData);
      try {
        const appRes = await axios.get(`${API_URL}/app/${data.appId}`);
        setAppData(appRes.data);
      } catch {}
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Signup failed');
    }
  };

  const logout = async () => {
    // Set before anything else, so it is in place long before the token clears.
    // Clearing the token used to wake two signed-out guards in the tabs, each of
    // which navigated to the login screen while the caller navigated to the
    // church search: three navigations at once, with the menu still closing.
    setIsLoggingOut(true);
    try {
      const userSubId = user?.native_notify_indie_id;
      // Read the church id that was actually registered, not the one currently in
      // memory: after a cold start where `/user` failed, `appData` is null and the
      // old code skipped this unregister entirely.
      const groupSubId =
        (await AsyncStorage.getItem(REGISTERED_CHURCH_SUB_ID)) || appData?.id;
      const nnAppId = appData?.native_notify_app_id || FALLBACK_NN_APP_ID;
      const nnAppToken = appData?.native_notify_app_token || FALLBACK_NN_APP_TOKEN;

      try {
        if (userSubId) {
          await unregisterIndieDevice(userSubId, nnAppId, nnAppToken);
        }
        if (groupSubId) {
          await unregisterIndieDevice(groupSubId, nnAppId, nnAppToken);
        }
      } catch (error) {
        console.error('Native Notify unregister failed:', error);
      }

      await AsyncStorage.removeItem(REGISTERED_CHURCH_SUB_ID);
      await clearStoredAuth();
    } catch (error) { console.error('Logout failed:', error); }
  };

  // The server just refused a request because the church is locked: re-read the
  // church so the locked screen shows now. At most once every few seconds, since
  // a screen full of lists fails all at once.
  useEffect(() => {
    if (!token) return;
    onChurchLocked = () => {
      if (Date.now() - lastChurchReadAtRef.current < 5000) return;
      refreshChurch();
    };
    return () => {
      onChurchLocked = null;
    };
  }, [token, refreshChurch]);

  // Anything the server did not send counts as "on", so an older server, a
  // failed read or a signed-out state never hides a section.
  const featureFlags = appData?.features;
  const features = useMemo<ChurchFeatures>(
    () => ({
      groups: featureFlags?.groups !== false,
      videos: featureFlags?.videos !== false,
      events: featureFlags?.events !== false,
    }),
    [featureFlags?.groups, featureFlags?.videos, featureFlags?.events]
  );
  const locked = appData?.locked === true;
  const lockMessage = typeof appData?.lock_message === 'string' ? appData.lock_message : null;

  return (
    <AuthContext.Provider
      value={{
        user, appData, token, isLoading, isLoggingOut, features, locked, lockMessage,
        login, signup, logout, refreshUser, refreshChurch, setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
