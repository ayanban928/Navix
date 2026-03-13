import type { AgentResponse, Trip } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

interface ApiRequestOptions {
  token?: string;
}

async function request<T>(path: string, init?: RequestInit, options?: ApiRequestOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (options?.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message = errorText || `Request failed with status ${response.status}`;

    try {
      const parsed = JSON.parse(errorText) as { error?: string };
      if (parsed.error) {
        message = parsed.error;
      }
    } catch {
      // Fall back to the raw response text when the server does not return JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();
  if (!responseText) {
    return undefined as T;
  }

  return JSON.parse(responseText) as T;
}

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
}

export async function signup(payload: SignupRequest): Promise<AuthResponse> {
  return request<AuthResponse>("/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchTrip(tripId: string, token: string): Promise<Trip> {
  return request<Trip>(`/v1/trips/${tripId}`, { method: "GET" }, { token });
}

export async function listTrips(token: string): Promise<Trip[]> {
  return request<Trip[]>("/v1/trips", { method: "GET" }, { token });
}

export async function createTrip(trip: Trip, token: string): Promise<Trip> {
  return request<Trip>(
    "/v1/trips",
    {
      method: "POST",
      body: JSON.stringify(trip)
    },
    { token }
  );
}

export async function deleteTrip(tripId: string, token: string): Promise<void> {
  return request<void>(`/v1/trips/${tripId}`, { method: "DELETE" }, { token });
}

export async function sendTripChatMessage(
  tripId: string,
  message: string,
  token: string
): Promise<AgentResponse> {
  return request<AgentResponse>(
    `/v1/trips/${tripId}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ message })
    },
    { token }
  );
}
