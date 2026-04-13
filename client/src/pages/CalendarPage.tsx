import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarView, CalendarEvent } from '../components/CalendarView';
import { fetchGoogleCalendarEvents, initiateGoogleLogin } from '../services/api';

export function CalendarPage() {
  const location = useLocation();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvents() {
      try {
        setLoading(true);
        const realEvents = await fetchGoogleCalendarEvents();

        const formatTime = (date: Date) => {
          let hours = date.getHours();
          const minutes = date.getMinutes();
          const ampm = hours >= 12 ? 'pm' : 'am';
          hours = hours % 12;
          hours = hours ? hours : 12; // the hour '0' should be '12'
          const minStr = minutes > 0 ? `:${minutes < 10 ? '0' + minutes : minutes}` : '';
          return `${hours}${minStr}${ampm}`;
        };

        const mappedEvents: CalendarEvent[] = realEvents.map(e => {
          const date = new Date(e.start_time);
          const hasTime = e.start_time.includes('T');

          return {
            id: e.id,
            title: e.description,
            year: date.getFullYear(),
            month: date.getMonth(),
            day: date.getDate(),
            type: 'google',
            displayTime: hasTime ? formatTime(date) : undefined
          };
        });

        setEvents(mappedEvents);
        setError(null);
      } catch (err: any) {
        if (err.message === 'AUTH_REQUIRED') {
          setError('AUTH_REQUIRED');
        } else {
          setError('Failed to sync with Google Calendar. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, []);

  return (
    <div>
      {/* Tab Navigation Header */}
      <div style={{ display: 'flex', gap: '32px', borderBottom: '1px solid var(--border)', marginBottom: '32px', paddingBottom: '12px' }}>
        <Link
          to="/trips"
          style={{
            color: location.pathname === '/trips' ? 'var(--primary)' : 'var(--text-muted)',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '1.1rem',
          }}
        >
          My Trips
        </Link>
        <Link
          to="/calendar"
          style={{
            color: location.pathname === '/calendar' ? 'var(--primary)' : 'var(--text-muted)',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '1.1rem',
            borderBottom: '2px solid var(--primary)',
            paddingBottom: '12px',
            marginBottom: '-13px'
          }}
        >
          Calendar
        </Link>
        <Link
          to="/settings"
          style={{
            color: location.pathname === '/settings' ? 'var(--primary)' : 'var(--text-muted)',
            textDecoration: 'none',
            fontWeight: '600',
            fontSize: '1.1rem',
          }}
        >
          Global Settings
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>
          <div className="spinner"></div> Syncing with Google Calendar...
        </div>
      ) : error === 'AUTH_REQUIRED' ? (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <h2 style={{ marginBottom: '12px' }}>Your Personal Calendar 🫵</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px', maxWidth: '400px', margin: '0 auto 32px' }}>
            Connect your Google Calendar to visualize your travel plans alongside your personal events.
          </p>
          <button className="btn" style={{ width: 'auto', padding: '12px 32px' }} onClick={initiateGoogleLogin}>
            Connect to Google Calendar
          </button>
        </div>
      ) : error ? (
        <div className="warning-banner" style={{ textAlign: 'center' }}>
          {error}
        </div>
      ) : (
        <CalendarView events={events} />
      )}
    </div>
  );
}
