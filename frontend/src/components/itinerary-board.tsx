import type { DayPlan } from "@/lib/types";

interface ItineraryBoardProps {
  days: DayPlan[];
}

export function ItineraryBoard({ days }: ItineraryBoardProps) {
  return (
    <section className="panel">
      <div className="panelHeaderRow">
        <h2>Itinerary</h2>
      </div>
      <div className="dayGrid">
        {days.map((day) => (
          <article className="dayCard" key={day.date}>
            <h3>{day.date}</h3>
            <p className="dayTheme">{day.theme}</p>
            <ul>
              {day.activities.map((activity) => (
                <li key={activity.id}>
                  <div className="activityHead">
                    <span>{activity.name}</span>
                    <span className={`statusPill ${activity.costStatus}`}>
                      {activity.costStatus}
                    </span>
                  </div>
                  <p>
                    {activity.startTime} - {activity.endTime} · {activity.location}
                  </p>
                  <p>
                    ${activity.cost} · source: <strong>{activity.source}</strong>
                  </p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
