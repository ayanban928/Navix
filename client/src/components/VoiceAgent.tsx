import React, { useState } from 'react';
// import { synthesizeSpeech } from '../services/api'; // Commented out for isolated UI focus

export default function VoiceAgent() {
  const [isActive, setIsActive] = useState(false);

  const toggleVoice = async () => {
    if (!isActive) {
      setIsActive(true);
      try {
        // Mocking the speech setup for isolated frontend testing
        console.log("Mocking ElevenLabs connection...");
        setTimeout(() => setIsActive(false), 3000); // Mock a 3 second audio playback
      } catch (err) {
        console.error(err);
        setIsActive(false);
      }
    } else {
      setIsActive(false);
    }
  };

  return (
    <div style={{ background: '#2a2a2a', padding: '16px', borderRadius: '8px', textAlign: 'center', marginBottom: '24px' }}>
      <h3 style={{ marginBottom: '16px' }}>ElevenLabs Setup</h3>
      <button 
        className="btn" 
        onClick={toggleVoice}
        style={{ 
          background: isActive ? '#ef4444' : '#3b82f6',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '0 auto'
        }}
      >
        {isActive ? '🔴 Listening/Speaking' : '🎙️ Start Interview'}
      </button>
      <p style={{ marginTop: '12px', fontSize: '0.8rem', color: '#aaa' }}>
        (Currently mocked for UI focus)
      </p>
    </div>
  );
}
