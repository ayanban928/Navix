"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createTrip, deleteTrip, listTrips } from "@/lib/api-client";
import { buildDefaultTrip } from "@/lib/trip-local-store";
import type { Trip, TripSummary } from "@/lib/types";

function toTripSummary(trip: Trip): TripSummary {
  return {
    id: trip.id,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    projectedCost: trip.projectedCost
  };
}

export function TripsDashboard() {
  const router = useRouter();
  const { email, isAuthenticated, isReady, logout, token, username } = useAuth();

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [menuTripId, setMenuTripId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [destinationInput, setDestinationInput] = useState("");
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!isReady || !isAuthenticated || !token) {
      return;
    }

    const sessionToken = token;

    let cancelled = false;

    async function loadTrips() {
      setIsLoadingTrips(true);
      setError(null);

      try {
        const result = await listTrips(sessionToken);
        if (cancelled) {
          return;
        }

        setTrips(result.map(toTripSummary));
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message = loadError instanceof Error ? loadError.message : "Failed to load trips.";
        setError(message);
      } finally {
        if (!cancelled) {
          setIsLoadingTrips(false);
        }
      }
    }

    void loadTrips();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isReady, token]);

  function openTrip(tripId: string) {
    router.push(`/app/trips/${tripId}`);
  }

  async function handleDeleteTrip(trip: TripSummary) {
    const confirmed = window.confirm(
      `Delete the trip to ${trip.destination}? This will remove the full planning state for this trip.`
    );

    if (!confirmed || !token) {
      return;
    }

    try {
      setError(null);
      await deleteTrip(trip.id, token);
      setTrips((prev) => prev.filter((item) => item.id !== trip.id));
      setMenuTripId(null);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete trip.";
      setError(message);
    }
  }

  async function handleCreateTrip(event: React.FormEvent) {
    event.preventDefault();
    if (!destinationInput.trim() || !token) {
      return;
    }

    try {
      setError(null);
      const newTrip = await createTrip(buildDefaultTrip(destinationInput.trim()), token);
      setTrips((prev) => [toTripSummary(newTrip), ...prev.filter((trip) => trip.id !== newTrip.id)]);
      setDestinationInput("");
      setShowCreateModal(false);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Failed to create trip.";
      setError(message);
    }
  }

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  if (!isReady || !isAuthenticated) {
    return <main className="centerMessage">Checking session...</main>;
  }

  if (isLoadingTrips) {
    return <main className="centerMessage">Loading trips...</main>;
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

      {error ? <p className="authError inWorkspace">{error}</p> : null}

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
