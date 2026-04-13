import React, { useState, useEffect } from 'react';
import { useTripState } from '../hooks/useTripState';
import { useGlobalSettings } from '../hooks/useGlobalSettings';
import { StatCard } from '../components/StatCard';
import { ItineraryList } from '../components/ItineraryList';
import { CalendarView, CalendarEvent } from '../components/CalendarView';
import { fetchGoogleCalendarEvents, pushGoogleCalendarEvent, initiateGoogleLogin, fetchTrips, Trip, ChatContextPayload } from '../services/api';
import { UnifiedChat } from '../components/UnifiedChat';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';

export function TripDetailsPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    events,
    budget,
    setBudget,
    projectedCost,
    isOverBudget,
    addEvent,
    updateEvent,
    removeEvent,
    reorderEvents,
    syncEvents,
    messages,
    llmMemory,
    preferences,
    setPreferences,
    clearEvents,
    updateMessages,
    setLlmMemory,
    loadTripData
  } = useTripState(1000);
  const { persona } = useGlobalSettings();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventCost, setNewEventCost] = useState<number | string>('');

  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasGoogleCal, setHasGoogleCal] = useState(true);

  const [showAuthConfirmModal, setShowAuthConfirmModal] = useState(false); // Legacy modal for confirm sync
  const [showAuthModal, setShowAuthModal] = useState(false); // Premium modal for connection
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<'connected' | 'disconnected'>('connected');
  const [alertMsg, setAlertMsg] = useState("");

  const handleSyncClick = () => {
    if (!hasGoogleCal) {
      setShowAuthConfirmModal(true);
      return;
    }
    setShowSyncModal(true);
  };

  const handleConfirmSync = async () => {
    setIsSyncing(true);
    try {
      const tentativeEvents = events.filter(e => !e.is_confirmed && e.source !== 'google_calendar');
      for (const ev of tentativeEvents) {
        await pushGoogleCalendarEvent(ev);
      }
      syncEvents();
      setShowSyncModal(false);
      setAlertMsg("Events have been pushed to Google Calendar and marked as confirmed!");
    } catch (error: any) {
      if (error.message === 'AUTH_REQUIRED') {
        setAlertMsg("You need to sign in with Google to push events.");
      } else {
        setAlertMsg("Failed to sync some events: " + error.message);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateObj = new Date(`${newEventDate}T${newEventTime || '12:00'}`);
    if (isNaN(dateObj.getTime())) return;

    addEvent({
      id: Date.now().toString(),
      start_time: dateObj.toISOString(),
      end_time: new Date(dateObj.getTime() + 3600000).toISOString(),
      description: newEventTitle + (newEventDesc ? ` - ${newEventDesc}` : ''),
      cost: Number(newEventCost || 0),
      source: 'manual',
      is_confirmed: false
    });
    setShowModal(false);
  };

  const handleEventMove = (eventId: string, year: number, month: number, day: number) => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      const oldDate = new Date(event.start_time);
      const newDate = new Date(year, month, day, oldDate.getHours(), oldDate.getMinutes(), oldDate.getSeconds());
      updateEvent({ ...event, start_time: newDate.toISOString() });
    }
  };

  const [tripName, setTripName] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchTrips().then(allTrips => {
      const currentTrip = allTrips.find((t: Trip) => t.id === id);
      if (currentTrip) {
        setTripName(currentTrip.destination);
        // Set budget from DB if available
        if (currentTrip.budget) {
          setBudget(currentTrip.budget);
        }
        // Load events, messages, and memory from DB
        if (id) {
          loadTripData(id);
        }
      } else {
        setNotFound(true);
      }
    });
  }, [id]);

  const tripContextPayload: ChatContextPayload = {
    trip_id: id || '',
    destination: tripName,
    persona,
    preferences,
    memory: llmMemory,
    budget,
    current_spend: projectedCost,
    events: events,
    history: messages,
    google_calendar_status: googleCalendarStatus,
    current_date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  };

  useEffect(() => {
    const formatTime = (date: Date) => {
      let hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minStr = minutes > 0 ? `:${minutes < 10 ? '0' + minutes : minutes}` : '';
      return `${hours}${minStr}${ampm}`;
    };

    async function loadGoogleEvents() {
      try {
        const realEvents = await fetchGoogleCalendarEvents();
        const mapped = realEvents.map(e => {
          const startTime = e.start_time || "";
          const date = new Date(startTime);
          const hasTime = startTime.includes('T');
          return {
            id: e.id,
            title: e.description,
            year: date.getFullYear(),
            month: date.getMonth(),
            day: date.getDate(),
            type: 'google',
            displayTime: (hasTime && startTime) ? formatTime(date) : undefined
          };
        });
        setGoogleEvents(mapped);
        setHasGoogleCal(true);
        setGoogleCalendarStatus('connected');
      } catch (err: any) {
        if (err.message === 'AUTH_REQUIRED') {
          setHasGoogleCal(false);
          setGoogleCalendarStatus('disconnected');
          setShowAuthModal(true);
        }
        console.error("Failed to load google events in trip view", err);
      }
    }
    loadGoogleEvents();
  }, []);

  // Map trip events to calendar format
  const tripCalendarEvents: CalendarEvent[] = (events || []).map(ev => {
    const startTime = ev.start_time || "";
    const date = new Date(startTime);
    const hasTime = startTime.includes('T');

    // Formatting helper (repeated for trip events)
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours % 12 || 12;
    const minStr = minutes > 0 ? `:${minutes < 10 ? '0' + minutes : minutes}` : '';
    const displayTime = `${displayHours}${minStr}${ampm}`;

    return {
      id: ev.id,
      title: ev.description,
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      type: id === '1' ? 'tokyo' : id === '2' ? 'paris' : 'default',
      displayTime: hasTime ? displayTime : undefined
    };
  });

  const allCalendarEvents = [...tripCalendarEvents, ...googleEvents];

  if (notFound) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ marginBottom: '16px' }}>Trip not found.</h2>
        <p style={{ marginBottom: '24px' }}>We couldn't find the adventure you're looking for. It might have been cleared from memory.</p>
        <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => navigate('/trips')}>Back to Dashboard</button>
      </div>
    );
  }

  if (!tripName) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ marginBottom: '16px' }}>Fetching your adventure...</h2>
        <div className="spinner" style={{ margin: '20px auto', border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }}></div>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}} />
        <button className="btn btn-secondary" style={{ width: 'auto', marginTop: '20px' }} onClick={() => navigate('/trips')}>Back to Trips</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/trips" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}>
            &larr; Back to Trips
          </Link>
          <h1 style={{ marginTop: '12px', marginBottom: '0' }}>Trip to {tripName}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '8px 12px' }}
            onClick={() => navigate(`/trips/${id}/settings`)}
            title="Trip Settings & Memory"
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Sidebar: Single Unified Chat */}
        <aside className="sidebar">
          <UnifiedChat
            messages={messages}
            tripContextPayload={tripContextPayload}
            onEventAdded={addEvent}
            onEventRemoved={removeEvent}
            onEventUpdated={updateEvent}
            onBudgetChanged={setBudget}
            onSyncCalendar={async () => {
              const tentativeEvents = events.filter(e => !e.is_confirmed && e.source !== 'google_calendar');
              for (const ev of tentativeEvents) {
                await pushGoogleCalendarEvent(ev);
              }
              syncEvents();
            }}
            onPreferencesChanged={(prefs) => setPreferences(prefs)}
            onClearItinerary={clearEvents}
            onMemoryUpdated={setLlmMemory}
            onAuthRequired={() => setShowAuthModal(true)}
            onMessagesChanged={updateMessages}
            events={events}
          />
        </aside>

        {/* Main Panel: Visualizing State */}
        <main className="main-content">
          {isOverBudget && (
            <div className="warning-banner">
              Projected cost exceeds your budget!
            </div>
          )}

          <section className="card">
            <h2 style={{ fontSize: '1.1rem', marginBottom: '20px' }}>Trip Overview</h2>
            <div style={{ display: 'flex', gap: '48px' }}>
              <StatCard label="Budget" value={`$${budget}`} />
              <StatCard
                label="Projected Cost"
                value={`$${projectedCost.toFixed(2)}`}
                color={isOverBudget ? 'var(--danger)' : 'inherit'}
              />
            </div>
          </section>

          <section className="card" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Itinerary</h2>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>+ Add Event</button>
                <button onClick={handleSyncClick} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Sync Calendar</button>

                <div style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  padding: '4px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)'
                }}>
                  <button
                    onClick={() => setViewMode('list')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: viewMode === 'list' ? 'white' : 'transparent',
                      boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: viewMode === 'list' ? '600' : '400',
                      color: viewMode === 'list' ? 'var(--primary)' : 'var(--text-muted)'
                    }}
                  >
                    List
                  </button>
                  <button
                    onClick={() => setViewMode('calendar')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: viewMode === 'calendar' ? 'white' : 'transparent',
                      boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: viewMode === 'calendar' ? '600' : '400',
                      color: viewMode === 'calendar' ? 'var(--primary)' : 'var(--text-muted)'
                    }}
                  >
                    Calendar
                  </button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              {viewMode === 'list' ? (
                <ItineraryList events={events} onReorder={reorderEvents} onUpdateEvent={updateEvent} onRemoveEvent={removeEvent} />
              ) : (
                <CalendarView
                  events={allCalendarEvents}
                  initialDate={tripCalendarEvents.length > 0 ? new Date(tripCalendarEvents[0].year, tripCalendarEvents[0].month, 1) : undefined}
                  onEventMove={handleEventMove}
                />
              )}
            </div>
          </section>
        </main>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h3>Manual Event</h3>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
              <input type="text" placeholder="Title" required value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <textarea placeholder="Description" value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }} rows={4} />
              <input type="date" required value={newEventDate} onChange={e => setNewEventDate(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <input type="time" required value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <input type="number" placeholder="Cost ($)" value={newEventCost} onChange={e => setNewEventCost(e.target.value)} style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Event</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSyncModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '16px', marginTop: 0 }}>Sync to Google Calendar</h3>
            <p style={{ color: '#555', marginBottom: '24px', lineHeight: '1.5' }}>
              Are you sure you want to push these tentative items into your main synced calendar?
              This will permanently add them to your connected Google Calendar.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSyncModal(false)}
                className="btn btn-secondary"
                disabled={isSyncing}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSync}
                className="btn btn-primary"
                disabled={isSyncing}
                style={{ minWidth: '100px' }}
              >
                {isSyncing ? 'Syncing...' : 'Yes, Sync'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuthConfirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '16px', marginTop: 0 }}>Authentication Required</h3>
            <p style={{ color: '#555', marginBottom: '24px', lineHeight: '1.5' }}>
              You are not connected to Google Calendar. Would you like to log in now?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAuthConfirmModal(false)}
                className="btn btn-secondary"
              >
                No, cancel
              </button>
              <button
                onClick={() => { setShowAuthConfirmModal(false); initiateGoogleLogin(); }}
                className="btn btn-primary"
              >
                Yes, log in
              </button>
            </div>
          </div>
        </div>
      )}

      {alertMsg && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%' }}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '16px', marginTop: 0 }}>Notification</h3>
            <p style={{ color: '#555', marginBottom: '24px', lineHeight: '1.5' }}>
              {alertMsg}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAlertMsg("")}
                className="btn btn-primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Auth Required Modal */}
      {showAuthModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--surface)',
            padding: '40px',
            borderRadius: '24px',
            width: '90%',
            maxWidth: '420px',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ 
              fontSize: '48px', 
              marginBottom: '20px',
              background: '#f1f5f9',
              width: '80px',
              height: '80px',
              lineHeight: '80px',
              borderRadius: '50%',
              margin: '0 auto 24px'
            }}>📅</div>
            <h2 style={{ marginBottom: '12px', fontSize: '24px', color: 'var(--text-main)' }}>Connect Calendar</h2>
            <p style={{ marginBottom: '32px', color: 'var(--text-muted)', fontSize: '16px', lineHeight: '1.6' }}>
              To fetch your existing plans or sync this itinerary, please connect your Google account.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                onClick={() => initiateGoogleLogin()}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--primary) 0%, #38bdf8 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(14, 165, 233, 0.25)',
                  transition: 'transform 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Connect Google Account
              </button>
              <button 
                onClick={() => setShowAuthModal(false)}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '15px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
