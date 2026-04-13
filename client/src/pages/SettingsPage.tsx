import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useParams } from 'react-router-dom';
import { useTripState } from '../hooks/useTripState';
import { ingestMemory, fetchTrips, updateTrip as apiUpdateTrip, Trip } from '../services/api';

export function SettingsPage() {
  const { id } = useParams();
  const { llmMemory, setLlmMemory, budget, setBudget, preferences, setPreferences } = useTripState(1000);

  // States for the new Upload Memory modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Dynamically load the trip destination from the database
  const [destination, setDestination] = useState('Loading...');
  useEffect(() => {
    fetchTrips().then(allTrips => {
      const trip = allTrips.find((t: Trip) => t.id === id);
      if (trip) {
        setDestination(trip.destination);
      } else {
        setDestination('International Trip');
      }
    });
  }, [id]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadUrl.trim() || uploadFile) {
      setIsUploading(true);
      setErrorMsg("");
      try {
        const aiResponse = await ingestMemory(uploadFile, uploadUrl, llmMemory, destination);
        setLlmMemory(aiResponse);
        setUploadUrl('');
        setUploadFile(null);
        setIsUploadModalOpen(false);
        setIsSuccessModalOpen(true);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || "Failed to ingest memory. Check console for details.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <Link to={`/trips/${id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}>
          &larr; Back to {destination}
        </Link>
        <h1 style={{ marginTop: '16px' }}>Trip Settings</h1>
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Core LLM Memory</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
          This is the persistent context that the Navix assistant uses to keep your trip logical and on-track, even across chat refreshes.
        </p>
        
        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
          <ReactMarkdown 
            components={{ 
              p: ({node, ...props}) => <p style={{margin: '8px 0'}} {...props} />,
              h1: ({node, ...props}) => <h1 style={{fontSize: '1.2rem', margin: '16px 0 8px'}} {...props} />,
              h2: ({node, ...props}) => <h2 style={{fontSize: '1.1rem', margin: '16px 0 8px'}} {...props} />,
              h3: ({node, ...props}) => <h3 style={{fontSize: '1rem', margin: '16px 0 8px'}} {...props} />
            }}
          >
            {llmMemory}
          </ReactMarkdown>
        </div>

        <div style={{ marginTop: '32px', display: 'flex', gap: '16px' }}>
          <button className="btn" style={{ width: 'auto' }} onClick={() => setLlmMemory("")}>
            Reset LLM Memory
          </button>
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setIsUploadModalOpen(true)}>
             Upload Your Own Memory
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Trip Preferences</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
          Customize your trip parameters and assistant behavior for this specific adventure.
        </p>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Trip Budget ($)</label>
          <input 
            type="number" 
            className="input-styled input-no-spinner" 
            placeholder="e.g. 1500" 
            value={budget || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || !isNaN(Number(val))) {
                setBudget(Number(val));
              }
            }}
            style={{ maxWidth: '200px' }}
          />
        </div>

        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Assistant Instructions</label>
        <textarea 
          className="input-styled" 
          style={{ height: '120px', resize: 'vertical', fontFamily: 'inherit' }}
          placeholder="e.g. I prefer quiet mornings, local food only, and a mix of high-end and budget-friendly activities..."
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
        ></textarea>
        
        <div style={{ textAlign: 'right', marginTop: '12px' }}>
          <button className="btn" style={{ width: 'auto' }} onClick={async () => {
            if (id) {
              await apiUpdateTrip(id, { budget, preferences });
            }
            setIsSuccessModalOpen(true);
          }}>
            Update Preferences & Budget
          </button>
        </div>
      </div>

      {/* Upload Memory Modal */}
      {isUploadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsUploadModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px' }}>Upload Your Own Memory</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Import context directly from ChatGPT, Gemini, or personal files to prime the Navix assistant.
            </p>
            
            <form onSubmit={handleUploadSubmit}>
              {errorMsg && (
                <div style={{ padding: '12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #ef4444', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem' }}>
                  <strong>Upload Blocked:</strong> {errorMsg}
                </div>
              )}
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>AI Share Link</label>
              <input 
                className="input-styled" 
                placeholder="Paste ChatGPT or Gemini URL..." 
                value={uploadUrl}
                onChange={e => setUploadUrl(e.target.value)}
              />

              <div style={{ margin: '16px 0' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Attach Document (.pdf, .txt)</label>
                <input 
                  type="file" 
                  accept=".pdf,.txt" 
                  className="input-styled" 
                  style={{ border: 'dashed 2px var(--border)', background: 'transparent' }} 
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                  disabled={isUploading}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadModalOpen(false)} disabled={isUploading}>Cancel</button>
                <button type="submit" className="btn" disabled={isUploading}>
                  {isUploading ? 'Gemini is compiling...' : 'Ingest Memory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {isSuccessModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSuccessModalOpen(false)}>
          <div className="modal-content" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚀</div>
            <h2 style={{ marginBottom: '12px' }}>Memory Synced</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              The Navix assistant has absorbed the new context into its active planning thread.
            </p>
            <button className="btn" onClick={() => setIsSuccessModalOpen(false)}>
              Proceed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
