import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { logoutUser, fetchTrips, Trip, createTrip, updateTrip, deleteTrip } from '../services/api';

export function TripListPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTripName, setNewTripName] = useState('');

  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editTripName, setEditTripName] = useState('');

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Fetch real trips from backend
  React.useEffect(() => {
    fetchTrips().then(data => {
      // Filter out 'ghost' trips with an empty string ID
      setTrips(data.filter(t => t.id && t.id.trim() !== ''));
      setLoading(false);
    });
  }, []);

  // Add Trip Logic
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTripName.trim()) {
      const newId = Date.now().toString();
      const newTrip: Trip = { 
        id: newId, 
        destination: newTripName.trim(), 
        date: 'TBD',
        budget: 1000,
        llm_memory: '',
        preferences: ''
      };
      
      // Persist to backend
      try {
        await createTrip(newTrip);
        
        setTrips([
          ...trips, 
          newTrip
        ]);
        setNewTripName('');
        setIsAddModalOpen(false);
        // Navigate to the new trip with the 'voice' signal
        navigate(`/trips/${newId}?voice=true`);
      } catch (err: any) {
        console.error("Failed to create trip:", err);
        alert("Failed to create trip. Your session might have expired. Please sign in again.");
      }
    }
  };

  // Edit Trip Logic
  const openEditModal = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setEditingTripId(id);
    setEditTripName(currentName);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTripId !== null && editTripName.trim()) {
      // Persist to DB
      await updateTrip(editingTripId, { destination: editTripName.trim() });
      setTrips(trips.map(t => t.id === editingTripId ? { ...t, destination: editTripName.trim() } : t));
      setEditingTripId(null);
    }
  };

  const confirmDelete = async () => {
    if (editingTripId !== null) {
      // Delete from DB (cascades to events, messages)
      await deleteTrip(editingTripId);
      setTrips(trips.filter(t => t.id !== editingTripId));
      setEditingTripId(null);
      setIsDeleteConfirmOpen(false);
    }
  };

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
            borderBottom: location.pathname === '/trips' ? '2px solid var(--primary)' : 'none',
            paddingBottom: '12px',
            marginBottom: '-13px'
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
            borderBottom: location.pathname === '/calendar' ? '2px solid var(--primary)' : 'none',
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
            borderBottom: location.pathname === '/settings' ? '2px solid var(--primary)' : 'none',
            paddingBottom: '12px',
            marginBottom: '-13px'
          }}
        >
          Global Settings
        </Link>
        <div style={{ marginLeft: 'auto' }}>
          <button 
            className="btn btn-secondary" 
            style={{ width: 'auto', padding: '8px 16px', fontSize: '0.9rem' }}
            onClick={() => logoutUser()}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Planned Adventures</h1>
        <button className="btn" style={{ width: 'auto' }} onClick={() => setIsAddModalOpen(true)}>
          + Add New Trip
        </button>
      </div>

      <div className="trip-grid">
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Syncing with adventure vault...</p>
        ) : trips.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No trips planned yet. Time to travel!</p>
        ) : (
          trips.map(trip => (
            <div key={trip.id} className="card trip-card" onClick={() => navigate(`/trips/${trip.id}`)} style={{ position: 'relative' }}>
              <button 
                onClick={(e) => openEditModal(e, trip.id, trip.destination)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '4px'
                }}
                aria-label="Edit Trip"
              >
                ✎ Edit
              </button>
              
              <div style={{ paddingRight: '48px' }}>
                 <h3 style={{ marginBottom: '8px' }}>{trip.destination}</h3>
              </div>
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.9rem' }}>{trip.date}</p>
            </div>
          ))
        )}
      </div>

      {/* Add Trip Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px' }}>Start a New Trip</h2>
            <form onSubmit={handleAddSubmit}>
              <input 
                autoFocus
                className="input-styled" 
                placeholder="Where are you going?" 
                value={newTripName}
                onChange={e => setNewTripName(e.target.value)}
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Trip Modal */}
      {editingTripId !== null && !isDeleteConfirmOpen && (
        <div className="modal-overlay" onClick={() => setEditingTripId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px' }}>Manage Trip</h2>
            <form onSubmit={handleEditSubmit}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>Trip Name</label>
              <input 
                autoFocus
                className="input-styled" 
                placeholder="Trip Name..." 
                value={editTripName}
                onChange={e => setEditTripName(e.target.value)}
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingTripId(null)}>Cancel</button>
                <button type="submit" className="btn">Save Changes</button>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />
              <div style={{ textAlign: 'center' }}>
                <button type="button" onClick={() => setIsDeleteConfirmOpen(true)} className="btn" style={{ background: 'var(--danger)', width: 'auto' }}>
                  Delete Trip entirely
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="modal-overlay" onClick={() => setIsDeleteConfirmOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px', color: 'var(--danger)' }}>Confirm Deletion</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Are you sure you want to delete <strong>{editTripName}</strong>? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsDeleteConfirmOpen(false)}>Go Back</button>
              <button type="button" onClick={confirmDelete} className="btn" style={{ background: 'var(--danger)' }}>
                Yes, Delete Trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
