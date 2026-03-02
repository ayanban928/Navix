import type { Booking } from "@/lib/types";

interface BookingsPanelProps {
  bookings: Booking[];
}

export function BookingsPanel({ bookings }: BookingsPanelProps) {
  return (
    <section className="panel">
      <div className="panelHeaderRow">
        <h2>Bookings</h2>
      </div>
      <ul className="bookingList">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <div>
              <p>{booking.itemName}</p>
              <small>
                {booking.vendor} · {booking.type}
              </small>
            </div>
            <div className="bookingMeta">
              <span className={`statusPill ${mapBookingStatus(booking.status)}`}>
                {booking.status}
              </span>
              {booking.evidenceUrl ? <a href={booking.evidenceUrl}>evidence</a> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function mapBookingStatus(status: Booking["status"]): "estimated" | "confirmed" {
  return status === "confirmed" ? "confirmed" : "estimated";
}
