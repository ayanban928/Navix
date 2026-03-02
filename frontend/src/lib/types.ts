export type CostStatus = "estimated" | "confirmed";

export interface Preferences {
  travelStyle: "relaxed" | "balanced" | "packed";
  interests: string[];
  hardConstraints: string[];
}

export interface Activity {
  id: string;
  name: string;
  category: "sightseeing" | "food" | "nightlife" | "transport" | "hotel";
  startTime: string;
  endTime: string;
  location: string;
  cost: number;
  costStatus: CostStatus;
  source: "manual" | "social" | "api" | "agent";
}

export interface DayPlan {
  date: string;
  theme: string;
  activities: Activity[];
}

export interface ExpenseItem {
  id: string;
  label: string;
  category: "flight" | "hotel" | "activity" | "food" | "transport";
  amount: number;
  status: CostStatus;
}

export interface Booking {
  id: string;
  type: "flight" | "hotel" | "activity";
  vendor: string;
  itemName: string;
  status: "suggested" | "pending_confirmation" | "confirmed";
  evidenceUrl?: string;
}

export interface Trip {
  id: string;
  destination: string;
  departureCity: string;
  startDate: string;
  endDate: string;
  budget: number;
  groupSize: number;
  preferences: Preferences;
  days: DayPlan[];
  projectedCost: number;
  confirmedCost: number;
  expenses: ExpenseItem[];
  bookings: Booking[];
  status: "onboarding" | "planning" | "ready_to_book" | "active";
}

export interface TripSummary {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: Trip["status"];
  projectedCost: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AgentResponse {
  assistantMessage: string;
  updatedTrip: Trip;
  stateChanges: string[];
}
