import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthModal } from '../components/AuthModal';
import { Navbar } from '../components/Navbar';
import * as firebaseServices from '../services/firebase';
import * as storeContext from '../store/context';

vi.mock('../services/firebase', () => ({
  auth: {},
  resetUserPassword: vi.fn().mockResolvedValue(undefined),
  googleProvider: {},
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn().mockReturnValue(() => {}),
  signOut: vi.fn(),
}));

vi.mock('../store/context', () => ({
  useStore: vi.fn(),
}));

describe('AuthModal Forgot Password Flow', () => {
  it('switches to forgot password mode and submits correctly', async () => {
    render(<AuthModal isOpen={true} onClose={() => {}} />);

    // Initially in Login mode
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();

    // Click Forgot Password link
    const forgotPasswordBtn = screen.getByRole('button', { name: 'Forgot Password?' });
    fireEvent.click(forgotPasswordBtn);

    // Now in Forgot Password mode
    expect(screen.getByRole('heading', { name: 'Forgot Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeInTheDocument();

    // Enter email
    const emailInput = screen.getByLabelText('Email');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: 'Send Reset Link' });
    fireEvent.click(submitBtn);

    // Verify resetUserPassword called
    await waitFor(() => {
      expect(firebaseServices.resetUserPassword).toHaveBeenCalledWith('test@example.com');
    });

    // Check for success message
    await waitFor(() => {
      expect(screen.getByText('Password reset email sent! Please check your inbox (and spam folder).')).toBeInTheDocument();
    });
  });
});

describe('Navbar Sync Status Badge', () => {
  const renderNavbarWithStatus = (syncStatus: string, lastSyncedAt?: string) => {
    (storeContext.useStore as any).mockReturnValue({
      billingState: null,
      syncStatus,
      lastSyncedAt
    });

    render(<Navbar currentRoute="home" onNavigate={() => {}} onLoginClick={() => {}} />);
  };

  it('renders correctly for synced status', () => {
    renderNavbarWithStatus('synced', new Date().toISOString());
    expect(screen.getByText('☁️ Synced')).toBeInTheDocument();
  });

  it('renders correctly for syncing status', () => {
    renderNavbarWithStatus('syncing');
    expect(screen.getByText('🔄 Syncing...')).toBeInTheDocument();
  });

  it('renders correctly for offline status', () => {
    renderNavbarWithStatus('offline');
    expect(screen.getByText('⚡ Offline (Saved Locally)')).toBeInTheDocument();
  });

  it('renders correctly for local status', () => {
    renderNavbarWithStatus('local');
    expect(screen.getByText('⚡ Saved Locally')).toBeInTheDocument();
  });

  it('renders correctly for error status', () => {
    renderNavbarWithStatus('error');
    expect(screen.getByText('⚠️ Sync Error')).toBeInTheDocument();
  });
});
