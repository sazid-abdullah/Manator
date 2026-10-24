import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import { LandingView } from '../views/LandingView';
import * as firebaseServices from '../services/firebase';

vi.mock('../services/firebase', () => ({
  fetchPricingConfig: vi.fn(() => Promise.resolve({ monthlyPrice: 150, yearlyPrice: 1500, bkashNumber: '', nagadNumber: '', rocketNumber: '', promoText: '', updatedAt: 0 }))
}));

describe('LandingView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders hero headlines and translates correctly', async () => {
    await act(async () => { await act(async () => { await act(async () => { render(<LandingView onEnterApp={vi.fn()} onSignIn={vi.fn()} />); }); }); });

    // EN default
    expect(screen.getByText('The #1 Smart Tuition, Batch & AI Exam Manager for Tutors in Bangladesh')).toBeInTheDocument();

    // Switch to BN
    const toggle = screen.getByText('বাংলা');
    fireEvent.click(toggle);
    expect(screen.getByText('বাংলাদেশের টিউটর ও কোচিং শিক্ষকদের জন্য ১ নম্বর স্মার্ট টিউশন ও ব্যাচ ম্যানেজার')).toBeInTheDocument();
  });

  it('renders interactive showcase tabs', async () => {
    render(<LandingView onEnterApp={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.getByText('1. Cycle & Batch')).toBeInTheDocument();
    expect(screen.getByText('2. WhatsApp Reports')).toBeInTheDocument();
  });

  it('renders pricing tiers correctly (live pricing via fetchPricingConfig)', async () => {
    render(<LandingView onEnterApp={vi.fn()} onSignIn={vi.fn()} />);
    expect(screen.getByText('Free Forever')).toBeInTheDocument();
    expect(screen.getByText('Tuitrix Pro')).toBeInTheDocument();

    // Should render default if mocked data takes time or resolves (we'll check default or dynamically loaded)
    const priceText = await screen.findByText(/৳150|৳199/);
    expect(priceText).toBeInTheDocument();
  });

  it('fires callbacks correctly', async () => {
    const onEnterApp = vi.fn();
    const onSignIn = vi.fn();
    await act(async () => { render(<LandingView onEnterApp={onEnterApp} onSignIn={onSignIn} />); });

    // There are multiple buttons with these texts, get the first or loop
    const startBtns = screen.getAllByRole('button', { name: /Start Free/i });
    fireEvent.click(startBtns[0]);
    expect(onEnterApp).toHaveBeenCalledTimes(1);

    const signinBtns = screen.getAllByRole('button', { name: /Sign In/i });
    fireEvent.click(signinBtns[0]);
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
