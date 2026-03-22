import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
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
  native_notify_app_id?: number;
  native_notify_app_token?: string | null;
}

interface AuthContextType {
  user: User | null;
  appData: AppData | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string, appId: string) => Promise<void>;
  signup: (data: { name: string; gender?: string; birth_date: string; email: string; password: string; appId: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = 'https://appmychurch.com/api/v1';
const FALLBACK_NN_APP_ID = 23936;
const FALLBACK_NN_APP_TOKEN = 'kqVaAXbDHXKd5tICC4dDQv';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearStoredAuth = async () => {
    await AsyncStorage.removeItem('accessToken');
    await AsyncStorage.removeItem('userData');
    setToken(null);
    setUser(null);
    setAppData(null);
  };

  useEffect(() => { loadStoredData(); }, []);

  useEffect(() => {
    const registerSubscriptions = async () => {
      const userSubId = user?.native_notify_indie_id;
      const groupSubId = appData?.id;
      if (!token || !userSubId || !groupSubId) return;

      try {
        const nnAppId = appData?.native_notify_app_id || FALLBACK_NN_APP_ID;
        const nnAppToken = appData?.native_notify_app_token || FALLBACK_NN_APP_TOKEN;

        await Promise.all([
          registerIndieID(userSubId, nnAppId, nnAppToken),
          registerIndieID(groupSubId, nnAppId, nnAppToken),
        ]);
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
          const res = await axios.get(`${API_URL}/user`, { headers: { Authorization: `Bearer ${storedToken}` } });
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
      const res = await axios.get(`${API_URL}/user`, { headers: { Authorization: `Bearer ${token}` } });
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

  const login = async (email: string, password: string, appId: string) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { email, password, appId });
      const { accessToken, user: userData } = response.data;
      await AsyncStorage.setItem('accessToken', accessToken);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      await AsyncStorage.setItem('appId', appId);
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
    try {
      const userSubId = user?.native_notify_indie_id;
      const groupSubId = appData?.id;
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

      await clearStoredAuth();
    } catch (error) { console.error('Logout failed:', error); }
  };

  return (
    <AuthContext.Provider value={{ user, appData, token, isLoading, login, signup, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
