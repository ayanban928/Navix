import React, { useState } from 'react';
import { Event, deleteGoogleCalendarEvent } from '../services/api';

interface ItineraryListProps {
  events: Event[];
  onReorder: (startIndex: number, endIndex: number) => void;
  onUpdateEvent?: (updatedEvent: Event) => void;
  onRemoveEvent?: (eventId: string) => void;
}

export function ItineraryList({ events, onReorder, onUpdateEvent, onRemoveEvent }: ItineraryListProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCost, setEditCost] = useState<number>(0);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");

  if (events.length === 0) {
    return <p style={{ color: '#aaa' }}>No events added yet.</p>;
  }

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (draggedIdx !== null && draggedIdx !== dropIdx) {
      if (onUpdateEvent) {
        const draggedEv = events[draggedIdx];
        const targetEv = events[dropIdx];
        
        const targetDate = new Date(targetEv.start_time);
        const draggedDate = new Date(draggedEv.start_time);
        
        const newDate = new Date(
          targetDate.getFullYear(), 
          targetDate.getMonth(), 
          targetDate.getDate(), 
          draggedDate.getHours(), 
          draggedDate.getMinutes(), 
          draggedDate.getSeconds()
        );
        
        onUpdateEvent({ ...draggedEv, start_time: newDate.toISOString() });
      }
      onReorder(draggedIdx, dropIdx);
    }
    setDraggedIdx(null);
  };

  const handleDelete = async (ev: Event) => {
      setIsDeleting(true);
      try {
        if (ev.is_confirmed || ev.source === 'google_calendar') {
          // Trigger remote delete first.
          await deleteGoogleCalendarEvent(ev.id);
        }
        if (onRemoveEvent) onRemoveEvent(ev.id);
        setSelectedEvent(null);
      } catch (err: any) {
        alert("Failed to delete from Calendar: " + err.message);
      } finally {
        setIsDeleting(false);
      }
  };

  const handleSave = async () => {
    if (selectedEvent && onUpdateEvent) {
      setIsSaving(true);
      try {
        // Here we just commit the local state up to TripContext.
        onUpdateEvent(selectedEvent);
        setSelectedEvent(null);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleFieldChange = (field: string, value: string | number) => {
    if (!selectedEvent) return;

    let newTitle = editTitle;
    let newDesc = editDesc;
    let newCost = editCost;
    let newDate = editDate;
    let newTime = editTime;

    if (field === 'title') { setEditTitle(value as string); newTitle = value as string; }
    if (field === 'desc') { setEditDesc(value as string); newDesc = value as string; }
    if (field === 'cost') { setEditCost(value as number); newCost = value as number; }
    if (field === 'date') { setEditDate(value as string); newDate = value as string; }
    if (field === 'time') { setEditTime(value as string); newTime = value as string; }

    const newDescription = newTitle + (newDesc ? ` - ${newDesc}` : '');
    
    const dateObj = new Date(`${newDate}T${newTime || '12:00'}`);
    const validDate = !isNaN(dateObj.getTime());
    const newStartISO = validDate ? dateObj.toISOString() : selectedEvent.start_time;
    const newEndISO = validDate ? new Date(dateObj.getTime() + 3600000).toISOString() : selectedEvent.end_time;

    const updated = {
       ...selectedEvent,
       description: newDescription,
       cost: newCost,
       start_time: newStartISO,
       end_time: newEndISO
    };
    setSelectedEvent(updated);
    // Removed the immediate onUpdateEvent(updated) so it only commits when Save is clicked.
  };

  let lastDateStr = '';

  // Sort events chronologically so newly-added events appear in the correct position
  const sortedEvents = [...events].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  const renderEventList = () => {
    return sortedEvents.map((ev, idx) => {
      const dateObj = new Date(ev.start_time);
      const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      
      const showHeader = dateStr !== lastDateStr;
      lastDateStr = dateStr;

      return (
        <React.Fragment key={ev.id}>
          {showHeader && (
            <h3 style={{ margin: '16px 0 8px 0', paddingBottom: '4px', borderBottom: '2px solid #eee', fontSize: '1.05rem', color: 'var(--text)' }}>
              {dateStr}
            </h3>
          )}
          <div 
            className="chat-bubble"
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, idx)}
            onClick={() => {
              const parts = ev.description.split('-');
              setEditTitle(parts[0].trim());
              setEditDesc(parts.slice(1).join('-').trim());
              setEditCost(ev.cost);
              
              const dObj = new Date(ev.start_time);
              const yy = dObj.getFullYear();
              const mm = String(dObj.getMonth() + 1).padStart(2, '0');
              const dd = String(dObj.getDate()).padStart(2, '0');
              const hh = String(dObj.getHours()).padStart(2, '0');
              const mns = String(dObj.getMinutes()).padStart(2, '0');
              setEditDate(`${yy}-${mm}-${dd}`);
              setEditTime(`${hh}:${mns}`);

              setSelectedEvent(ev);
            }}
            style={{ 
              cursor: 'grab', 
              opacity: draggedIdx === idx ? 0.5 : 1,
              borderLeft: ev.is_confirmed ? '4px solid var(--primary)' : '4px solid orange',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              transition: 'transform 0.1s ease'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '8px'}}>
                {ev.description.split('-')[0]}
              </strong>
              <span>${ev.cost.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>
              {dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} &bull; Click for details
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {renderEventList()}
      
      {selectedEvent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedEvent(null)}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', width: '400px', maxWidth: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <input 
                type="text" 
                value={editTitle} 
                onChange={e => handleFieldChange('title', e.target.value)} 
                style={{ fontSize: '1.2rem', fontWeight: 'bold', border: '1px solid transparent', borderBottom: '1px solid #eee', width: '100%', marginRight: '16px', padding: '4px', outline: 'none' }} 
              />
              <button 
                onClick={() => setSelectedEvent(null)} 
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#555' }}>Description</label>
                <textarea value={editDesc} onChange={e => handleFieldChange('desc', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical', boxSizing: 'border-box' }} rows={3} />
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#555' }}>Date</label>
                  <input type="date" value={editDate} onChange={e => handleFieldChange('date', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#555' }}>Time</label>
                  <input type="time" value={editTime} onChange={e => handleFieldChange('time', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: '#555' }}>Cost ($)</label>
                <input type="number" value={editCost} onChange={e => handleFieldChange('cost', Number(e.target.value))} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
              </div>
              <p style={{ color: '#555', marginBottom: '8px', fontSize: '0.9rem' }}><strong>Date & Time:</strong> {new Date(selectedEvent.start_time).toLocaleString()}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
               <button 
                 onClick={() => handleDelete(selectedEvent)} 
                 disabled={isDeleting || isSaving}
                 style={{ background: '#e11d48', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                   {isDeleting ? 'Deleting...' : 'Delete Event'}
               </button>
               <button 
                 onClick={handleSave} 
                 disabled={isDeleting || isSaving}
                 style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                   {isSaving ? 'Saving...' : 'Save Edits'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
