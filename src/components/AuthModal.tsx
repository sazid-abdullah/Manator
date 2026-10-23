import React, { useState } from 'react';
import { Modal } from './Modal';
import { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, resetUserPassword } from '../services/firebase';
import { isOwnerEmail } from '../utils/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handlePostAuth = (userEmail: string | null) => {
    if (isOwnerEmail(userEmail)) {
      setSuccessMsg('Welcome back, Owner! Admin privileges granted.');
    } else {
      setSuccessMsg('Authentication successful.');
    }
    setTimeout(() => {
      setSuccessMsg('');
      onClose();
    }, 1500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'forgot-password') {
        if (!email.trim()) {
          throw new Error('Please enter your email address');
        }
        await resetUserPassword(email);
        setSuccessMsg('Password reset email sent! Please check your inbox (and spam folder).');
      } else {
        let userCredential;
        if (mode === 'login') {
          if (!auth) throw new Error('Offline mode: Firebase Auth is not initialized');
          userCredential = await signInWithEmailAndPassword(auth, email, password);
        } else {
          if (!auth) throw new Error('Offline mode: Firebase Auth is not initialized');
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
        }
        handlePostAuth(userCredential.user.email);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      if (!auth || !googleProvider) throw new Error('Offline mode: Firebase Auth is not initialized');
      const userCredential = await signInWithPopup(auth, googleProvider);
      handlePostAuth(userCredential.user.email);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (!auth) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Offline Mode">
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <p>Authentication is currently unavailable because the application is running in offline mode.</p>
          <button type="button" className="btn primary" onClick={onClose} style={{ marginTop: '16px' }}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  const title = mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Forgot Password';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && <div className="notice warn">{error}</div>}
        {successMsg && <div className="notice success" style={{ background: 'var(--success-bg)', color: 'var(--success-text)', padding: '8px 12px', borderRadius: '4px', fontSize: '0.9rem' }}>{successMsg}</div>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input"
          />
        </label>

        {mode !== 'forgot-password' && (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input"
              minLength={6}
            />
          </label>
        )}

        {mode === 'login' && (
          <div style={{ textAlign: 'right' }}>
            <button
              type="button"
              onClick={() => { setMode('forgot-password'); setError(''); setSuccessMsg(''); }}
              className="btn text"
              style={{ fontSize: '0.85rem', padding: '0' }}
            >
              Forgot Password?
            </button>
          </div>
        )}

        <button type="submit" className="btn primary" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
          {loading ? 'Processing...' : (mode === 'login' ? 'Login' : mode === 'signup' ? 'Sign Up' : 'Send Reset Link')}
        </button>

        {mode !== 'forgot-password' && (
          <>
            <div style={{ textAlign: 'center', margin: '8px 0', color: 'var(--muted)' }}>OR</div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="btn"
              disabled={loading}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          {mode === 'forgot-password' ? (
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
              className="btn text"
              style={{ fontSize: '0.9rem' }}
            >
              Back to Sign In
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="btn text"
              style={{ fontSize: '0.9rem' }}
            >
              {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Login"}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};
