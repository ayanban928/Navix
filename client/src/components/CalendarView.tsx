import React, { useState } from 'react';

export interface CalendarEvent {
  id: string;
  title: string;
  year: number;
  month: number;
  day: number;
  type?: string;
  displayTime?: string;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  initialDate?: Date;
  onEventMove?: (eventId: string, year: number, month: number, day: number) => void;
}

export function CalendarView({ events, initialDate, onEventMove }: CalendarViewProps) {
  // Calendar state: Start with initialDate or October 2026
  const [viewDate, setViewDate] = useState(initialDate || new Date(2026, 9, 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    setViewDate(new Date(year, month + 1, 1));
  };

  // Calendar grid logic
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  const days = [];
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    days.push({ day: prevMonthLastDay - i, currentMonth: false, monthOffset: -1 });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true, monthOffset: 0 });
  }
  const totalCells = Math.ceil((days.length) / 7) * 7;
  const paddingNeeded = totalCells - days.length;
  for (let i = 1; i <= paddingNeeded; i++) {
    days.push({ day: i, currentMonth: false, monthOffset: 1 });
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleDrop = (e: React.DragEvent, dayObj: any) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('eventId');
    if (eventId && onEventMove) {
      let targetMonth = month + dayObj.monthOffset;
      let targetYear = year;
      if (targetMonth < 0) { targetMonth = 11; targetYear--; }
      if (targetMonth > 11) { targetMonth = 0; targetYear++; }
      onEventMove(eventId, targetYear, targetMonth, dayObj.day);
    }
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{monthNames[month]} {year}</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }} onClick={handlePrev}>&lsaquo; Prev</button>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.85rem' }} onClick={handleNext}>Next &rsaquo;</button>
        </div>
      </div>

      <div className="calendar-grid">
        {dayLabels.map(label => (
          <div key={label} className="calendar-day-label">{label}</div>
        ))}
        
        {days.map((d, index) => {
          let checkM = month + d.monthOffset;
          let checkY = year;
          if (checkM < 0) { checkM = 11; checkY--; }
          if (checkM > 11) { checkM = 0; checkY++; }

          const dayEvents = events.filter(e => e.year === checkY && e.month === checkM && e.day === d.day);
          
          return (
            <div 
              key={index} 
              className={`calendar-day ${!d.currentMonth ? 'other-month' : ''}`} 
              style={{ minHeight: '80px' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, d)}
            >
              <div className="calendar-day-number">{d.day}</div>
              {dayEvents.map(event => (
                <div 
                  key={event.id} 
                  className={`calendar-event ${event.type || ''}`} 
                  title={event.title}
                  draggable={event.type !== 'google'}
                  onDragStart={(e) => {
                    if (event.type !== 'google') {
                      e.dataTransfer.setData('eventId', event.id);
                    }
                  }}
                  style={{ cursor: event.type !== 'google' ? 'grab' : 'default' }}
                >
                  {event.displayTime && <span style={{ fontWeight: 'bold', fontSize: '0.75rem', marginRight: '4px', opacity: 0.8 }}>{event.displayTime}</span>}
                  {event.title}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
