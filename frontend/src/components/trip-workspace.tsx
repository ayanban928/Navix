"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { BookingsPanel } from "@/components/bookings-panel";
import { ChatPanel } from "@/components/chat-panel";
import { ExpensesPanel } from "@/components/expenses-panel";
import { ItineraryBoard } from "@/components/itinerary-board";
import { StateChangeLog } from "@/components/state-change-log";
import { TopBar } from "@/components/top-bar";
import { TripOverview } from "@/components/trip-overview";
import { fetchTrip, sendTripChatMessage } from "@/lib/api-client";
import { DEMO_TOKEN, runDemoAgent } from "@/lib/demo-session";
import { getTripById, saveTrip } from "@/lib/trip-local-store";
import type { ChatMessage, Trip } from "@/lib/types";

interface TripWorkspaceProps {
  tripId: string;
}

export function TripWorkspace({ tripId }: TripWorkspaceProps) {
  const router = useRouter();
  const { token, email, username, logout } = useAuth();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [changes, setChanges] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemoSession = token === DEMO_TOKEN;

  const userKey = useMemo(() => {
    return (username || email || "guest").toLowerCase().replace(/[^a-z0-9_@.-]/g, "_");
  }, [email, username]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    async function loadTrip() {
      setIsLoadingTrip(true);
      setError(null);

      try {
        if (isDemoSession) {
          const demoStoredTrip = getTripById(userKey, tripId);
          if (!demoStoredTrip) {
            throw new Error("Trip not found. Return to Trips Dashboard and pick an available trip.");
          }

          if (cancelled) {
            return;
          }

          setTrip(demoStoredTrip);
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "Demo trip loaded. You can keep editing this itinerary and use chat to apply deterministic updates.",
              createdAt: new Date().toISOString()
            }
          ]);
          setChanges(["Loaded trip from local demo dashboard store."]);
          return;
        }

        const result = await fetchTrip(tripId, token);
        if (cancelled) {
          return;
        }

        setTrip(result);
        saveTrip(userKey, result);
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Trip ${result.id} loaded from backend source of truth.`,
            createdAt: new Date().toISOString()
          }
        ]);
        setChanges(["Loaded trip from backend source of truth."]);
      } catch (loadError) {
        const fallback = getTripById(userKey, tripId);

        if (fallback && !cancelled) {
          setTrip(fallback);
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Loaded locally cached trip copy.",
              createdAt: new Date().toISOString()
            }
          ]);
          setChanges(["Using locally saved trip state (backend fetch failed)."]);
        }

        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "Failed to load trip.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTrip(false);
        }
      }
    }

    void loadTrip();

    return () => {
      cancelled = true;
    };
  }, [isDemoSession, token, tripId, userKey]);

  const dateRange = useMemo(() => {
    if (!trip) {
      return "No trip loaded";
    }
    return `${trip.startDate} -> ${trip.endDate}`;
  }, [trip]);

  const userLabel = useMemo(() => {
    if (username) {
      return username;
    }
    if (email) {
      const [emailPrefix] = email.split("@");
      return emailPrefix || "user";
    }
    return "user";
  }, [email, username]);

  async function handleSend(message: string) {
    if (!token || !trip) {
      setError("Trip is not available yet.");
      return;
    }

    const userTurn: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, userTurn]);
    setIsSending(true);
    setError(null);

    try {
      if (isDemoSession) {
        const result = runDemoAgent(message, trip);
        const assistantTurn: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.assistantMessage,
          createdAt: new Date().toISOString()
        };
        setTrip(result.updatedTrip);
        saveTrip(userKey, result.updatedTrip);
        setChanges(result.stateChanges);
        setMessages((prev) => [...prev, assistantTurn]);
        return;
      }

      const result = await sendTripChatMessage(trip.id, message, token);

      const assistantTurn: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.assistantMessage,
        createdAt: new Date().toISOString()
      };

      setTrip(result.updatedTrip);
      saveTrip(userKey, result.updatedTrip);
      setChanges(result.stateChanges);
      setMessages((prev) => [...prev, assistantTurn]);
    } catch (sendError) {
      const sendMessage = sendError instanceof Error ? sendError.message : "Chat update failed.";
      setError(sendMessage);
    } finally {
      setIsSending(false);
    }
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (!trip || isLoadingTrip) {
    return <main className="centerMessage">Loading trip workspace...</main>;
  }

  return (
    <main className="workspaceShell">
      <TopBar
        destination={trip.destination}
        dateRange={dateRange}
        onBack={() => router.push("/app")}
        onLogout={handleLogout}
        status={trip.status}
        userLabel={userLabel}
      />
      {error ? <p className="authError inWorkspace">{error}</p> : null}
      <div className="workspaceGrid">
        <div className="leftRail">
          <ChatPanel messages={messages} isSending={isSending} onSend={handleSend} />
        </div>
        <div className="rightRail">
          <TripOverview trip={trip} />
          <StateChangeLog changes={changes} />
          <ItineraryBoard days={trip.days} />
          <div className="dualPanel">
            <ExpensesPanel expenses={trip.expenses} />
            <BookingsPanel bookings={trip.bookings} />
          </div>
        </div>
      </div>
    </main>
  );
}
