const AUTH_TOKEN_KEY = "navix_access_token";
const AUTH_EMAIL_KEY = "navix_user_email";
const AUTH_USERNAME_KEY = "navix_username";

export function readAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function readAuthEmail(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_EMAIL_KEY);
}

export function readAuthUsername(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_USERNAME_KEY);
}

export function writeAuthSession(token: string, username: string, email: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(AUTH_EMAIL_KEY, email);
  window.localStorage.setItem(AUTH_USERNAME_KEY, username);
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_EMAIL_KEY);
  window.localStorage.removeItem(AUTH_USERNAME_KEY);
}
