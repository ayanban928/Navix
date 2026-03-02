"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { DEMO_TOKEN } from "@/lib/demo-session";
import { createTrip, deleteTrip, ensureDemoTrips, listTripSummaries } from "@/lib/trip-local-store";
import type { TripSummary } from "@/lib/types";

export function TripsDashboard() {
  const router = useRouter();
  const { email, isAuthenticated, isReady, logout, token, username } = useAuth();

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [menuTripId, setMenuTripId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [destinationInput, setDestinationInput] = useState("");

  const userKey = useMemo(() => {
    return (username || email || "guest").toLowerCase().replace(/[^a-z0-9_@.-]/g, "_");
  }, [email, username]);

  const userLabel = useMemo(() => {
    if (username) {
      return username;
    }
    if (email) {
      const [prefix] = email.split("@");
      return prefix || "user";
    }
    return "user";
  }, [email, username]);

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isReady, router]);

  useEffect(() => {
    if (!isReady || !isAuthenticated) {
      return;
    }

    if (token === DEMO_TOKEN) {
      setTrips(ensureDemoTrips(userKey));
      return;
    }

    setTrips(listTripSummaries(userKey));
  }, [isAuthenticated, isReady, token, userKey]);

  function openTrip(tripId: string) {
    router.push(`/app/trips/${tripId}`);
  }

  function handleDeleteTrip(trip: TripSummary) {
    const confirmed = window.confirm(
      `Delete the trip to ${trip.destination}? This will remove the full planning state for this trip.`
    );

    if (!confirmed) {
      return;
    }

    deleteTrip(userKey, trip.id);
    setTrips((prev) => prev.filter((item) => item.id !== trip.id));
    setMenuTripId(null);
  }

  function handleCreateTrip(event: React.FormEvent) {
    event.preventDefault();
    if (!destinationInput.trim()) {
      return;
    }

    const newTrip = createTrip(userKey, { destination: destinationInput.trim() });
    setTrips((prev) => [
      {
        id: newTrip.id,
        destination: newTrip.destination,
        startDate: newTrip.startDate,
        endDate: newTrip.endDate,
        status: newTrip.status,
        projectedCost: newTrip.projectedCost
      },
      ...prev
    ]);
    setDestinationInput("");
    setShowCreateModal(false);
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (!isReady || !isAuthenticated) {
    return <main className="centerMessage">Checking session...</main>;
  }

  return (
    <main className="tripsShell">
      <header className="tripsHeader">
        <div>
          <p className="eyebrow">Trip Dashboard</p>
          <h1>Your Trip Plans</h1>
          <p className="detailLine">Pick a trip bubble to continue planning.</p>
        </div>
        <div className="tripsHeaderMeta">
          <span className="userBadge">{userLabel}</span>
          <button className="ghostButton" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      {trips.length === 0 ? (
        <section className="panel emptyTripsPanel">
          <h2>No trips yet</h2>
          <p className="detailLine">Use the + button to add your first trip plan.</p>
        </section>
      ) : (
        <section className="tripBubbleGrid">
          {trips.map((trip) => (
            <article className="tripBubble" key={trip.id}>
              <button className="tripBubbleMain" onClick={() => openTrip(trip.id)} type="button">
                <p className="tripDestination">{trip.destination}</p>
                <p className="tripDateRange">
                  {trip.startDate}
                  {" to "}
                  {trip.endDate}
                </p>
                <p className="tripStatus">{trip.status}</p>
              </button>

              <div className="tripMenuWrap">
                <button
                  aria-label="Trip actions"
                  className="tripMenuButton"
                  onClick={() => setMenuTripId((prev) => (prev === trip.id ? null : trip.id))}
                  type="button"
                >
                  ...
                </button>
                {menuTripId === trip.id ? (
                  <div className="tripMenu">
                    <button onClick={() => handleDeleteTrip(trip)} type="button">
                      Delete trip
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}

      <div className="fabWrap">
        <span className="fabTooltip">Add new trip</span>
        <button className="fabButton" onClick={() => setShowCreateModal(true)} type="button">
          +
        </button>
      </div>

      {showCreateModal ? (
        <div className="modalBackdrop" onClick={() => setShowCreateModal(false)} role="presentation">
          <section className="modalCard" onClick={(event) => event.stopPropagation()}>
            <h2>Add New Trip</h2>
            <p className="detailLine">Start with a destination. You can refine details inside the trip view.</p>
            <form className="authForm" onSubmit={handleCreateTrip}>
              <label>
                Destination
                <input
                  onChange={(event) => setDestinationInput(event.target.value)}
                  placeholder="e.g. Barcelona, Spain"
                  required
                  type="text"
                  value={destinationInput}
                />
              </label>
              <div className="modalActions">
                <button className="ghostButton" onClick={() => setShowCreateModal(false)} type="button">
                  Cancel
                </button>
                <button type="submit">Create trip</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
