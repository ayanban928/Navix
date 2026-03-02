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
import { DEMO_TOKEN, demoTrip, runDemoAgent } from "@/lib/demo-session";
import type { ChatMessage, Trip } from "@/lib/types";

export function TripWorkspace() {
  const router = useRouter();
  const { token, email, username, logout } = useAuth();

  const [tripIdInput, setTripIdInput] = useState("");
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [changes, setChanges] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTrip, setIsLoadingTrip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemoSession = token === DEMO_TOKEN;

  useEffect(() => {
    if (!isDemoSession || trip) {
      return;
    }

    setTrip(demoTrip);
    setActiveTripId(demoTrip.id);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Demo account loaded. You can test dashboard interactions immediately. Try: 'confirm flight' or 'add food'.",
        createdAt: new Date().toISOString()
      }
    ]);
    setChanges(["Loaded demo trip snapshot for dashboard preview."]);
  }, [isDemoSession, trip]);

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

  async function handleLoadTrip() {
    if (!token || !tripIdInput.trim()) {
      return;
    }

    setIsLoadingTrip(true);
    setError(null);

    try {
      const result = await fetchTrip(tripIdInput.trim(), token);
      setTrip(result);
      setActiveTripId(result.id);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Trip ${result.id} loaded. Ask me to update the itinerary with explicit structured changes.`,
          createdAt: new Date().toISOString()
        }
      ]);
      setChanges(["Loaded trip from backend source of truth."]);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load trip.";
      setError(message);
    } finally {
      setIsLoadingTrip(false);
    }
  }

  async function handleSend(message: string) {
    if (!token || !activeTripId || !trip) {
      setError("Load a trip before sending chat updates.");
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
        setChanges(result.stateChanges);
        setMessages((prev) => [...prev, assistantTurn]);
        return;
      }

      const result = await sendTripChatMessage(activeTripId, message, token);

      const assistantTurn: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.assistantMessage,
        createdAt: new Date().toISOString()
      };

      setTrip(result.updatedTrip);
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

  if (!trip) {
    return (
      <main className="workspaceShell">
        <section className="panel loadTripPanel">
          <p className="eyebrow">Trip Bootstrap</p>
          <h1>Load Existing Trip</h1>
          <p className="detailLine">
            Enter a trip ID from your backend to start planning. Or use demo login to see a seeded dashboard.
          </p>
          <div className="tripLoaderRow">
            <input
              onChange={(event) => setTripIdInput(event.target.value)}
              placeholder="trip_123"
              value={tripIdInput}
            />
            <button disabled={!tripIdInput.trim() || isLoadingTrip} onClick={handleLoadTrip} type="button">
              {isLoadingTrip ? "Loading..." : "Load trip"}
            </button>
          </div>
          {error ? <p className="authError">{error}</p> : null}
          <button className="ghostButton" onClick={handleLogout} type="button">
            Logout {userLabel ? `(${userLabel})` : ""}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="workspaceShell">
      <TopBar
        destination={trip.destination}
        dateRange={dateRange}
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
