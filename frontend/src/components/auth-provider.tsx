"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { login as loginRequest, signup as signupRequest } from "@/lib/api-client";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_TOKEN,
  DEMO_USERNAME
} from "@/lib/demo-session";
import {
  clearAuthSession,
  readAuthEmail,
  readAuthToken,
  readAuthUsername,
  writeAuthSession
} from "@/lib/auth-storage";

interface AuthContextValue {
  token: string | null;
  email: string | null;
  username: string | null;
  isReady: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setToken(readAuthToken());
    setEmail(readAuthEmail());
    setUsername(readAuthUsername());
    setIsReady(true);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const normalized = identifier.trim().toLowerCase();
    const demoMatch =
      password === DEMO_PASSWORD &&
      (normalized === DEMO_EMAIL.toLowerCase() || normalized === DEMO_USERNAME.toLowerCase());

    if (demoMatch) {
      setToken(DEMO_TOKEN);
      setUsername(DEMO_USERNAME);
      setEmail(DEMO_EMAIL);
      writeAuthSession(DEMO_TOKEN, DEMO_USERNAME, DEMO_EMAIL);
      return;
    }

    const response = await loginRequest({ identifier, password });
    setToken(response.accessToken);
    setUsername(response.user.username);
    setEmail(response.user.email);
    writeAuthSession(response.accessToken, response.user.username, response.user.email);
  }, []);

  const signup = useCallback(async (inputUsername: string, inputEmail: string, password: string) => {
    const response = await signupRequest({ username: inputUsername, email: inputEmail, password });
    setToken(response.accessToken);
    setUsername(response.user.username);
    setEmail(response.user.email);
    writeAuthSession(response.accessToken, response.user.username, response.user.email);
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setEmail(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      email,
      username,
      isReady,
      isAuthenticated: Boolean(token),
      login,
      signup,
      logout
    }),
    [email, isReady, login, logout, signup, token, username]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
