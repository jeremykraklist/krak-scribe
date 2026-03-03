const TOKEN_KEY = "krakscribe_token";
const USER_KEY = "krakscribe_user";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Authenticated fetch wrapper */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  // Auto-logout on 401
  if (response.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  return response;
}

/** Login */
export async function login(
  email: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Login failed");
  }

  const data = await response.json();
  setAuth(data.token, data.user);
  return data;
}

/** Register */
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<{ user: AuthUser; token: string }> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Registration failed");
  }

  const data = await response.json();
  setAuth(data.token, data.user);
  return data;
}

/** Logout */
export function logout(): void {
  clearAuth();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}
