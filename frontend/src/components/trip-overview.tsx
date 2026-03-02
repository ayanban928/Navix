import type { Trip } from "@/lib/types";

interface TripOverviewProps {
  trip: Trip;
}

export function TripOverview({ trip }: TripOverviewProps) {
  return (
    <section className="panel">
      <div className="panelHeaderRow">
        <h2>Trip State</h2>
      </div>
      <dl className="metricsGrid">
        <div>
          <dt>Budget</dt>
          <dd>${trip.budget.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Projected</dt>
          <dd>${trip.projectedCost.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Confirmed</dt>
          <dd>${trip.confirmedCost.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Group Size</dt>
          <dd>{trip.groupSize}</dd>
        </div>
      </dl>
      <p className="detailLine">
        <strong>Departure:</strong> {trip.departureCity}
      </p>
      <p className="detailLine">
        <strong>Travel Style:</strong> {trip.preferences.travelStyle}
      </p>
      <p className="detailLine">
        <strong>Hard Constraints:</strong> {trip.preferences.hardConstraints.join(", ")}
      </p>
    </section>
  );
}
