import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { 
  Event, 
  Message, 
  AuditLog,
  fetchTripEvents, 
  saveTripEvent, 
  updateTripEvent as apiUpdateEvent, 
  deleteTripEvent, 
  clearTripEvents, 
  fetchTripMessages, 
  saveTripMessage, 
  clearTripMessages, 
  fetchMemory, 
  updateTripMemory, 
  updateTrip 
} from '../services/api';

// Re-export types for consumers of the context
export type { Message, AuditLog };

interface TripContextType {
  events: Event[];
  budget: number;
  setBudget: (budget: number) => void;
  projectedCost: number;
  isOverBudget: boolean;
  addEvent: (newEvent: Event) => void;
  updateEvent: (updatedEvent: Event) => void;
  removeEvent: (eventId: string) => void;
  reorderEvents: (startIndex: number, endIndex: number) => void;
  syncEvents: () => void;
  clearEvents: () => void;
  messages: Message[];
  updateMessages: (newMessages: Message[]) => void;
  clearMessages: () => void;
  setLlmMemory: React.Dispatch<React.SetStateAction<string>>;
  llmMemory: string;
  preferences: string;
  setPreferences: React.Dispatch<React.SetStateAction<string>>;
  activeTripId: string | null;
  setActiveTripId: (id: string | null) => void;
  loadTripData: (tripId: string) => Promise<void>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [budget, setBudgetState] = useState(1000);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your Navix agent. Tell me what's on your mind!",
      sender: 'assistant',
      timestamp: new Date().toISOString()
    }
  ]);

  const [llmMemory, setLlmMemory] = useState<string>("");
  const [preferences, setPreferences] = useState<string>("");

  const projectedCost = events.reduce((acc, ev) => acc + ev.cost, 0);
  const isOverBudget = projectedCost > budget;

  // Load all trip data from the database
  const loadTripData = useCallback(async (tripId: string) => {
    setActiveTripId(tripId);
    
    // Load events from DB
    const dbEvents = await fetchTripEvents(tripId);
    setEvents(dbEvents);

    // Load messages from DB
    const dbMessages = await fetchTripMessages(tripId);
    if (dbMessages.length > 0) {
      setMessages(dbMessages);
    } else {
      setMessages([{
        id: '1',
        text: "Hello! I'm your Navix agent. Tell me what's on your mind!",
        sender: 'assistant',
        timestamp: new Date().toISOString()
      }]);
    }

    // Load memory from DB
    const dbMemory = await fetchMemory(tripId);
    setLlmMemory(dbMemory);
  }, []);

  // Persist budget changes to DB
  const setBudget = (newBudget: number) => {
    setBudgetState(newBudget);
    if (activeTripId) {
      updateTrip(activeTripId, { budget: newBudget }).catch(console.error);
    }
  };

  const addEvent = (newEvent: Event) => {
    setEvents((prev) => [...prev, newEvent]);
    setLlmMemory(prev => prev + ` User added ${newEvent.description} at $${newEvent.cost}.`);
    
    // Persist to DB
    if (activeTripId) {
      saveTripEvent(activeTripId, newEvent).catch(console.error);
    }
  };

  const updateEvent = (updatedEvent: Event) => {
    setEvents((prev) => prev.map(ev => ev.id === updatedEvent.id ? updatedEvent : ev));
    
    // Persist to DB
    if (activeTripId) {
      apiUpdateEvent(activeTripId, updatedEvent).catch(console.error);
    }
  };

  const removeEvent = (eventId: string) => {
    setEvents((prev) => prev.filter(ev => ev.id !== eventId));
    
    // Persist to DB
    if (activeTripId) {
      deleteTripEvent(activeTripId, eventId).catch(console.error);
    }
  };

  const reorderEvents = (startIndex: number, endIndex: number) => {
    setEvents((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  };

  const syncEvents = () => {
    setEvents((prev) => {
      const synced = prev.map(ev => ({ ...ev, is_confirmed: true }));
      // Persist confirmed status to DB
      if (activeTripId) {
        synced.forEach(ev => {
          apiUpdateEvent(activeTripId!, ev).catch(console.error);
        });
      }
      return synced;
    });
  };

  const updateMessages = (newMessages: Message[]) => {
    setMessages(newMessages);
    
    // Persist new messages to DB (save the last 2 — user + assistant)
    if (activeTripId && newMessages.length >= 2) {
      const lastTwo = newMessages.slice(-2);
      lastTwo.forEach(msg => {
        saveTripMessage(activeTripId!, msg).catch(console.error);
      });
    }
  };

  const clearMessages = () => {
    const freshMessage: Message = {
      id: Date.now().toString(),
      text: "Chat context refreshed. I still remember your trip details and memory.",
      sender: 'assistant',
      timestamp: new Date().toISOString()
    };
    setMessages([freshMessage]);
    
    // Clear from DB and save the fresh message
    if (activeTripId) {
      clearTripMessages(activeTripId).then(() => {
        saveTripMessage(activeTripId!, freshMessage).catch(console.error);
      }).catch(console.error);
    }
  };

  const clearEvents = () => {
    setEvents([]);
    
    // Clear from DB
    if (activeTripId) {
      clearTripEvents(activeTripId).catch(console.error);
    }
  };

  // Persist memory and preferences changes to DB (on state updates)
  const wrappedSetLlmMemory: React.Dispatch<React.SetStateAction<string>> = (value) => {
    setLlmMemory((prev) => {
      const newVal = typeof value === 'function' ? value(prev) : value;
      if (activeTripId && newVal !== prev) {
        updateTripMemory(activeTripId, newVal).catch(console.error);
      }
      return newVal;
    });
  };

  const wrappedSetPreferences: React.Dispatch<React.SetStateAction<string>> = (value) => {
    setPreferences((prev) => {
      const newVal = typeof value === 'function' ? value(prev) : value;
      if (activeTripId && newVal !== prev) {
        updateTrip(activeTripId, { preferences: newVal }).catch(console.error);
      }
      return newVal;
    });
  };

  return (
    <TripContext.Provider value={{
      events,
      budget,
      setBudget,
      projectedCost,
      isOverBudget,
      addEvent,
      updateEvent,
      removeEvent,
      reorderEvents,
      syncEvents,
      clearEvents,
      messages,
      updateMessages,
      clearMessages,
      setLlmMemory: wrappedSetLlmMemory,
      llmMemory,
      preferences,
      setPreferences: wrappedSetPreferences,
      activeTripId,
      setActiveTripId,
      loadTripData
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useSharedTripState() {
  const context = useContext(TripContext);
  if (context === undefined) {
    throw new Error('useSharedTripState must be used within a TripProvider');
  }
  return context;
}
