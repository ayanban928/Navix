import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGlobalSettings } from '../hooks/useGlobalSettings';

export function GlobalSettings() {
  const location = useLocation();
  const { persona, setPersona } = useGlobalSettings();
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);

  const handleSave = () => {
    setIsSavedModalOpen(true);
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
            borderBottom: '2px solid var(--primary)',
            paddingBottom: '12px',
            marginBottom: '-13px'
          }}
        >
          Global Settings
        </Link>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Assistant Persona</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
          Describe how you want your Navix assistant to behave across all trips. This defines its personality, communication style, and global priorities.
        </p>
        
        <textarea 
          className="input-styled" 
          style={{ height: '180px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6' }}
          placeholder="e.g. Always be efficient and professional. Focus on finding the fastest routes and highest-rated dining options. If I'm over budget, be firm but helpful..."
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
        ></textarea>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            These settings will be applied to every chat session.
          </span>
          <button className="btn" style={{ width: 'auto' }} onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>

      {/* Custom Save Confirmation Modal */}
      {isSavedModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSavedModalOpen(false)}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
            <h2 style={{ marginBottom: '12px' }}>Changes Saved</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Your global assistant persona has been updated successfully.
            </p>
            <button className="btn" onClick={() => setIsSavedModalOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
