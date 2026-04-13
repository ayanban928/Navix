import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser } from '../services/api';

export function AuthPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      let data;
      if (isSignUp) {
        await registerUser(username, password);
        data = await loginUser(username, password);
      } else {
        data = await loginUser(username, password);
      }
      
      // Cookies are handled automatically by the server and browser
      navigate('/trips');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed';
      // Switch to sign-up mode if user or password is "not existent"
      if (!isSignUp && (msg.includes('User not found') || msg.includes('Invalid password'))) {
        setIsSignUp(true);
        setError('Account not found or password incorrect. Please create an account.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '700', margin: 0, color: 'var(--primary)' }}>Navix</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
            {isSignUp ? 'Join the future of travel' : 'Welcome back to your console'}
          </p>
        </div>
        {error && (
          <div style={{ 
            padding: '12px', 
            backgroundColor: 'rgba(239, 68, 68, 0.1)', 
            color: 'rgb(239, 68, 68)', 
            borderRadius: '8px', 
            marginBottom: '20px',
            fontSize: '0.9rem'
          }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleAuth}>
          <input 
            className="input-styled" 
            type="text" 
            placeholder="Username" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required 
          />
          <input 
            className="input-styled" 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
          />
          {isSignUp && (
            <input 
              className="input-styled" 
              type="password" 
              placeholder="Confirm Password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required 
            />
          )}
          <button 
            className="btn" 
            style={{ marginTop: '16px' }} 
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>
        
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {isSignUp ? 'Already have an account?' : 'New to Navix?'}
          </p>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
          >
            {isSignUp ? 'Sign In to Existing Account' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
