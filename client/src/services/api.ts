const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080') + '/api';

/**
 * Standard fetch wrapper for Navix.
 * Handles:
 * 1. Base URL prefixing 
 * 2. Automatic credentials inclusion (cookies)
 * 3. Consistent error handling
 */
const navixFetch = async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'X-User-ID': localStorage.getItem('navix_user_id') || '',
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('AUTH_REQUIRED');
    }
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  return response;
};

/**
 * Fetch with Streaming (SSE via POST).
 * Used for AI chat and video analysis where we need to send complex state.
 */
const navixStreamingFetch = async (
  endpoint: string, 
  body: any, 
  onChunk: (data: any) => void
): Promise<void> => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'X-User-ID': localStorage.getItem('navix_user_id') || '',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('AUTH_REQUIRED');
    const err = await response.text();
    throw new Error(err || 'Streaming request failed');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    // Process SSE format: "data: {...}\n\n"
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep the last incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        try {
          const json = JSON.parse(trimmed.replace('data: ', ''));
          onChunk(json);
        } catch (e) {
          console.warn("Failed to parse SSE chunk:", trimmed);
        }
      }
    }
  }
};

export interface Event {
  id: string;
  start_time: string;
  end_time: string;
  description: string;
  cost: number;
  source: 'google_calendar' | 'manual' | 'llm';
  is_confirmed: boolean;
}

export interface Trip {
  id: string;
  destination: string;
  date: string;
  budget: number;
  llm_memory: string;
  preferences: string;
}

export interface AuditLog {
  agent: string;
  message: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  audit_trail?: AuditLog[];
}

export interface ChatContextPayload {
  trip_id: string;
  destination: string;
  persona: string;
  memory: string; // Map to LLMMemory in backend
  preferences: string;
  history?: Message[];
  tool_history?: string;
  budget?: number;
  current_spend?: number;
  events?: Event[];
  google_calendar_status?: string;
  current_date?: string;
}

export interface ToolCallPayload {
  tool_call_id?: string;
  tool_name: string;
  params: any;
}

// ── 1. Authentication ───────────────────────────────────────

export const initiateGoogleLogin = () => {
  const userId = localStorage.getItem('navix_user_id') || '';
  window.location.href = `${API_BASE}/auth/login?user_id=${userId}`;
};

export const loginUser = async (username: string, password: string): Promise<any> => {
  const response = await navixFetch('/auth/internal/login', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  if (data.user_id) {
    localStorage.setItem('navix_user_id', data.user_id);
    localStorage.setItem('navix_username', username);
  }
  return data;
};

export const registerUser = async (username: string, password: string): Promise<any> => {
  const response = await navixFetch('/navix/auth/internal/register', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  if (data.user_id) {
    localStorage.setItem('navix_user_id', data.user_id);
    localStorage.setItem('navix_username', username);
  }
  return data;
};

export const logoutUser = async (): Promise<void> => {
  await navixFetch('/auth/logout', { method: 'POST' });
  localStorage.removeItem('navix_username');
  localStorage.removeItem('navix_user_id');
  window.location.href = '/';
};

// ── 2. Trip Management ──────────────────────────────────────

export const fetchTrips = async (): Promise<Trip[]> => {
  const response = await navixFetch('/trips');
  return await response.json();
};

export const createTrip = async (trip: Partial<Trip>): Promise<Trip> => {
  const response = await navixFetch('/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(trip),
  });
  return await response.json();
};

export const updateTrip = async (tripId: string, updates: Partial<Trip>): Promise<Trip> => {
  const response = await navixFetch(`/trips/${tripId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return await response.json();
};

export const deleteTrip = async (tripId: string): Promise<void> => {
  await navixFetch(`/trips/${tripId}`, { method: 'DELETE' });
};

// ── 3. Itinerary & Events ───────────────────────────────────

export const fetchTripEvents = async (tripId: string): Promise<Event[]> => {
  const response = await navixFetch(`/trips/${tripId}/events`);
  return await response.json();
};

export const saveTripEvent = async (tripId: string, event: Partial<Event>): Promise<Event> => {
  const response = await navixFetch(`/trips/${tripId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return await response.json();
};

export const updateTripEvent = async (tripId: string, event: Event): Promise<Event> => {
  const response = await navixFetch(`/trips/${tripId}/events/${event.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  return await response.json();
};

export const deleteTripEvent = async (tripId: string, eventId: string): Promise<void> => {
  await navixFetch(`/trips/${tripId}/events/${eventId}`, { method: 'DELETE' });
};

export const clearTripEvents = async (tripId: string): Promise<void> => {
  await navixFetch(`/trips/${tripId}/events/all`, { method: 'DELETE' });
};

// ── 4. Google Calendar Integration ──────────────────────────

export const fetchGoogleCalendarEvents = async (): Promise<Event[]> => {
  const response = await navixFetch('/calendar/events');
  const rawEvents = await response.json();
  
  return rawEvents.map((ge: any) => ({
    id: ge.id,
    start_time: ge.start.dateTime || ge.start.date,
    end_time: ge.end.dateTime || ge.end.date,
    description: ge.summary || 'Calendar Event',
    cost: 0, 
    source: 'google_calendar',
    is_confirmed: true
  }));
};

export const pushGoogleCalendarEvent = async (ev: Event): Promise<any> => {
  const response = await navixFetch('/calendar/events/push', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.description,
      description: `Imported via Navix. Cost: $${ev.cost}`,
      start_time: ev.start_time,
      end_time: ev.end_time
    }),
  });
  return response.json();
};

export const deleteGoogleCalendarEvent = async (eventId: string): Promise<void> => {
  await navixFetch('/calendar/events/delete', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: eventId }),
  });
};

// ── 5. AI Chat & Shadow Agent (Streaming via POST-SSE) ──────

export const fetchTripMessages = async (tripId: string): Promise<Message[]> => {
  const response = await navixFetch(`/trips/${tripId}/messages`);
  return await response.json();
};

export const saveTripMessage = async (tripId: string, message: Partial<Message>): Promise<Message> => {
  const response = await navixFetch(`/trips/${tripId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  return await response.json();
};

export const clearTripMessages = async (tripId: string): Promise<void> => {
  await navixFetch(`/trips/${tripId}/messages`, { method: 'DELETE' });
};

export const fetchMemory = async (tripId: string): Promise<string> => {
  const response = await navixFetch(`/trips/${tripId}/memory`);
  const data = await response.json();
  return data.memory || '';
};

export const updateTripMemory = async (tripId: string, text: string): Promise<any> => {
  const response = await navixFetch(`/trips/${tripId}/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trip_id: tripId, text }),
  });
  return await response.json();
};

/**
 * Streaming Chat AI with tool calling and audit trail.
 * Uses legacy 'PostChat' interface on backend.
 */
export const chatWithAI = async (
  message: string,
  context: ChatContextPayload,
  onLog: (log: AuditLog) => void,
  onToolCall: (call: ToolCallPayload) => void,
  onMemoryUpdated?: (memory: string) => void
): Promise<string> => {
  let finalContent = "";

  const payload = {
    message: message,
    destination: context.destination,
    persona: context.persona || "Helpful Travel Assistant",
    preferences: context.preferences,
    llm_memory: context.memory,
    budget: context.budget || 1000,
    current_spend: context.current_spend || 0,
    history: context.history,
    events: context.events,
    tool_history: context.tool_history,
    google_calendar_status: context.google_calendar_status || 'not_connected',
    current_date: context.current_date || new Date().toISOString()
  };

  await navixStreamingFetch('/chat', payload, (data) => {
    if (data.type === 'audit') {
      onLog(data.log);
    } else if (data.type === 'tool_call') {
      onToolCall({ tool_name: data.tool_name, params: data.params });
    } else if (data.type === 'final') {
      finalContent = data.response;
    } else if (data.type === 'memory_update') {
      if (onMemoryUpdated) onMemoryUpdated(data.memory);
    }
  });

  return finalContent;
};

/**
 * Resumes chat after user approves/rejects a tool call.
 */
export const submitToolResult = async (
  message: string,
  tool_name: string,
  tool_result: string,
  context: ChatContextPayload,
  onLog: (log: AuditLog) => void,
  onMemoryUpdated?: (memory: string) => void
): Promise<string> => {
  let finalContent = "";

  const payload = {
    user_message: message,
    tool_name: tool_name,
    tool_result: tool_result,
    history: context.history,
    chat_context: {
        destination: context.destination,
        persona: context.persona || "Helpful Travel Assistant",
        preferences: context.preferences,
        llm_memory: context.memory,
        budget: context.budget || 1000,
        current_spend: context.current_spend || 0,
        history: context.history,
        events: context.events,
        tool_history: context.tool_history,
        google_calendar_status: context.google_calendar_status || 'not_connected',
        current_date: context.current_date || new Date().toISOString()
    }
  };

  await navixStreamingFetch('/chat/tool-result', payload, (data) => {
    if (data.type === 'audit') {
      onLog(data.log);
    } else if (data.type === 'final') {
      finalContent = data.response;
    } else if (data.type === 'memory_update') {
      if (onMemoryUpdated) onMemoryUpdated(data.memory);
    }
  });

  return finalContent;
};

// ── 6. Ingestion (Social Media / Video) ─────────────────────

export const ingestSocialVideo = async (url: string, message: string, context: ChatContextPayload): Promise<any> => {
  const payload = {
    url,
    message,
    destination: context.destination,
    persona: context.persona,
    preferences: context.preferences,
    llm_memory: context.memory,
    budget: context.budget,
    current_spend: context.current_spend,
    history: context.history,
    current_date: context.current_date || new Date().toISOString()
  };

  const response = await navixFetch('/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return await response.json();
};

export const ingestMemory = async (file: File | null, url: string, currentMemory: string, destination: string): Promise<string> => {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  formData.append('url', url);
  formData.append('currentMemory', currentMemory);
  formData.append('destination', destination);

  const response = await fetch(`${API_BASE}/ingest/memory`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('AUTH_REQUIRED');
    const errText = await response.text();
    throw new Error(errText || 'Failed to ingest memory');
  }

  const result = await response.json();
  return result.response;
};
