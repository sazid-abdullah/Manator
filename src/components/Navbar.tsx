import React, { useState, useEffect } from 'react';
import { auth, signOut, onAuthStateChanged } from '../services/firebase';
import { User } from 'firebase/auth';
import { useStore } from '../store/context';

interface NavbarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  onLoginClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, onNavigate, onLoginClick }) => {
  const { state, updateSettings, billingState, syncStatus, lastSyncedAt } = useStore();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone display mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    if (auth) unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // If iOS or not prompted yet, navigate to Settings publishing tab
      onNavigate('settings');
    }
  };

  const navItems = [
    {
      id: 'home',
      label: 'Home',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      ),
    },
    {
      id: 'students',
      label: 'Students',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="4" />
          <path d="M1 21c0-4 4-6 8-6s8 2 8 6" />
          <path d="M16 4a4 4 0 0 1 0 8M19 15c2.5.7 4 2.7 4 6" />
        </svg>
      ),
    },
    {
      id: 'classes',
      label: 'Classes',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h8" />
        </svg>
      ),
    },
    {
      id: 'money',
      label: 'Money',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="6" width="20" height="13" rx="2" />
          <circle cx="12" cy="12.5" r="3" />
          <path d="M6 10v5M18 10v5" />
        </svg>
      ),
    },
    {
      id: 'ai',
      label: 'AI',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
          <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" />
        </svg>
      ),
    },

    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      ),
    },
    {
      id: 'landing',
      label: 'About Tuitrix',
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z"/>
        </svg>
      ),
    }

  ];

  return (
    <header id="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <a
          href="#/"
          onClick={e => {
            e.preventDefault();
            onNavigate('home');
          }}
          className="brand"
        >
          <svg width="28" height="28" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bg_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#161922"/>
                <stop offset="100%" stopColor="#0b0d14"/>
              </linearGradient>
              <linearGradient id="grad1_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe"/>
                <stop offset="100%" stopColor="#4facfe"/>
              </linearGradient>
              <linearGradient id="grad2_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4facfe"/>
                <stop offset="100%" stopColor="#0015ff"/>
              </linearGradient>
              <linearGradient id="grad3_nav" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00f2fe"/>
                <stop offset="100%" stopColor="#0015ff"/>
              </linearGradient>
              <linearGradient id="gradStemRight_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4facfe"/>
                <stop offset="100%" stopColor="#0015ff"/>
              </linearGradient>
              <linearGradient id="gradStemLeft_nav" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#00f2fe"/>
                <stop offset="100%" stopColor="#4facfe"/>
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="112" fill="url(#bg_nav)"/>
            <g transform="translate(256, 216)">
              <path d="M 0 -90 L -130 -90 L -170 -40 L -40 -40 Z" fill="url(#grad1_nav)" opacity="0.8" />
              <path d="M 0 -90 L 130 -90 L 170 -40 L 40 -40 Z" fill="url(#grad2_nav)" opacity="0.9" />
              <path d="M -40 -40 L -170 -40 L -130 10 L 0 10 Z" fill="url(#grad3_nav)" />
              <path d="M 40 -40 L 170 -40 L 130 10 L 0 10 Z" fill="url(#grad2_nav)" />
              <polygon points="0,-70 40,-40 0,10 -40,-40" fill="url(#grad1_nav)" opacity="0.95" />
              <polygon points="0,-45 18,-30 0,-5 -18,-30" fill="#00f2fe" />
              <path d="M 0 10 L -40 10 L -90 150 L 0 150 Z" fill="url(#gradStemLeft_nav)" />
              <path d="M 0 10 L 40 10 L 90 150 L 0 150 Z" fill="url(#gradStemRight_nav)" />
              <polygon points="-90,150 90,150 60,170 -60,170" fill="#00f2fe" opacity="0.8" />
              <polyline points="-130,-90 -170,-40 -130,10" fill="none" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
              <polyline points="130,-90 170,-40 130,10" fill="none" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
              <line x1="-90" y1="150" x2="-60" y2="170" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
              <line x1="90" y1="150" x2="60" y2="170" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
              <line x1="0" y1="10" x2="0" y2="150" stroke="#00f2fe" strokeWidth="2" opacity="0.4" />
            </g>
          </svg>
          <span style={{
            background: 'linear-gradient(to right, #00f2fe, #4facfe, #0015ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent',
            fontWeight: 800,
            letterSpacing: '0.02em',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>Tuitrix</span>
        </a>

        {deferredPrompt && !isInstalled && (
          <button
            onClick={handleInstallClick}
            className="btn xs primary"
            style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '6px' }}
            title="Install Tuitrix app on this device"
          >
            📲 Install App
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
          <button
            onClick={() => updateSettings({ theme: state.settings.theme === 'light' ? 'dark' : 'light' })}
            className="icon-btn"
            title={state.settings.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            style={{ padding: '4px', fontSize: '1.2rem', marginRight: '4px' }}
          >
            {state.settings.theme === 'light' ? '🌙' : '☀️'}
          </button>

          {syncStatus === 'synced' && (
            <span className="badge green hide-mobile" title={lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Synced to cloud'}>☁️ Synced</span>
          )}
          {syncStatus === 'syncing' && (
            <span className="badge blue hide-mobile" style={{ animation: 'pulse 1.5s infinite' }} title="Syncing changes to cloud...">🔄 Syncing...</span>
          )}
          {syncStatus === 'offline' && (
            <span className="badge yellow hide-mobile" title="You are offline. Changes saved locally.">⚡ Offline (Saved Locally)</span>
          )}
          {syncStatus === 'local' && (
            <span className="badge hide-mobile" style={{ background: 'var(--surface-2)' }} title="Changes saved to local storage">⚡ Saved Locally</span>
          )}
          {syncStatus === 'error' && (
            <span className="badge red hide-mobile" title="Error syncing to cloud">⚠️ Sync Error</span>
          )}

          {user ? (
            <>
              {billingState ? (
                <span className={`badge ${billingState.plan === 'pro' ? 'green' : 'blue'}`}>
                  {billingState.plan === 'pro' ? 'Pro' : `${billingState.credits} credits`}
                </span>
              ) : (
                <span className="badge blue hide-mobile">Free (BYOK)</span>
              )}
              <span style={{ color: 'var(--muted)' }} className="hide-mobile">{user.email}</span>
              <button onClick={() => auth && signOut(auth)} className="btn xs">Logout</button>
            </>
          ) : (
            <>
              <span className="badge blue hide-mobile">Free (BYOK)</span>
              <button onClick={onLoginClick} className="btn xs primary">Login</button>
            </>
          )}
        </div>
      </div>

      <nav id="nav" aria-label="Main">
        {navItems.map(item => {
          const isActive =
            currentRoute === item.id ||
            (item.id === 'students' && currentRoute === 'student');
          return (
            <a
              key={item.id}
              href={`#/${item.id}`}
              onClick={e => {
                e.preventDefault();
                onNavigate(item.id);
              }}
              className={isActive ? 'active' : ''}
              data-route={item.id}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </header>
  );
};
