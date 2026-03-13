import type { Trip, TripSummary } from "@/lib/types";

const SUMMARY_KEY_PREFIX = "navix_trips";
const TRIP_KEY_PREFIX = "navix_trip";

interface NewTripInput {
  destination: string;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function summaryStorageKey(userKey: string): string {
  return `${SUMMARY_KEY_PREFIX}_${userKey}`;
}

function tripStorageKey(userKey: string, tripId: string): string {
  return `${TRIP_KEY_PREFIX}_${userKey}_${tripId}`;
}

function toSummary(trip: Trip): TripSummary {
  return {
    id: trip.id,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    projectedCost: trip.projectedCost
  };
}

function addDays(baseDate: Date, days: number): Date {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function buildDefaultTrip(destination: string): Trip {
  const start = addDays(new Date(), 30);
  const end = addDays(start, 4);
  const tripId = `trip_${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: tripId,
    destination,
    departureCity: "New York",
    startDate: dateString(start),
    endDate: dateString(end),
    budget: 3000,
    groupSize: 2,
    preferences: {
      travelStyle: "balanced",
      interests: ["food", "culture"],
      hardConstraints: []
    },
    days: [
      {
        date: dateString(start),
        theme: "Arrival",
        activities: [
          {
            id: `act_${Math.random().toString(36).slice(2, 8)}`,
            name: "Check-in and neighborhood walk",
            category: "sightseeing",
            startTime: "16:00",
            endTime: "18:00",
            location: destination,
            cost: 0,
            costStatus: "estimated",
            source: "manual"
          }
        ]
      }
    ],
    projectedCost: 0,
    confirmedCost: 0,
    expenses: [],
    bookings: [],
    status: "planning"
  };
}

function listTripSummaries(userKey: string): TripSummary[] {
  if (typeof window === "undefined") {
    return [];
  }

  const summaries = safeJsonParse<TripSummary[]>(
    window.localStorage.getItem(summaryStorageKey(userKey)),
    []
  );

  return summaries.sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function getTripById(userKey: string, tripId: string): Trip | null {
  if (typeof window === "undefined") {
    return null;
  }

  return safeJsonParse<Trip | null>(window.localStorage.getItem(tripStorageKey(userKey, tripId)), null);
}

export function saveTrip(userKey: string, trip: Trip): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(tripStorageKey(userKey, trip.id), JSON.stringify(trip));

  const summaries = listTripSummaries(userKey);
  const nextSummary = toSummary(trip);
  const withoutCurrent = summaries.filter((summary) => summary.id !== trip.id);
  window.localStorage.setItem(summaryStorageKey(userKey), JSON.stringify([nextSummary, ...withoutCurrent]));
}

