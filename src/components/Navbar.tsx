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
  const { billingState } = useStore();
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="8" fill="#5b8cff" />
            <path d="M7 20V9L14 5L21 9V20" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 13H17" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M14 10V18" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>Tuitrix</span>
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

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            {billingState ? (
              <span className={`badge ${billingState.plan === 'pro' ? 'green' : 'blue'}`}>
                {billingState.plan === 'pro' ? 'Pro' : `${billingState.credits} credits`}
              </span>
            ) : (
              <span className="badge blue">Free (BYOK)</span>
            )}
            <span style={{ color: 'var(--muted)' }} className="hide-mobile">{user.email}</span>
            <button onClick={() => signOut(auth)} className="btn xs">Logout</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="badge blue hide-mobile">Free (BYOK)</span>
            <button onClick={onLoginClick} className="btn xs primary">Login</button>
          </div>
        )}
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
