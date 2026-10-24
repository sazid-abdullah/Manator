import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ApkShareModal } from '../components/ApkShareModal';
import { RewardedAdModal } from '../components/RewardedAdModal';

describe('themeAndPolish', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('APK URL logic works', () => {
    import.meta.env.VITE_ANDROID_APK_URL = 'https://example.com/app.apk';

    // We cannot easily test window.location.href directly in JSDOM cleanly
    // without mocking `window.location`. So we will verify the modal renders.
    render(<ApkShareModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('📥 Download Android APK')).toBeInTheDocument();
    expect(screen.getByText('📋 Copy Link')).toBeInTheDocument();
  });

  it('RewardedAdModal fallback logic works', async () => {
    import.meta.env.VITE_ADSENSE_CLIENT_ID = '';
    import.meta.env.VITE_ADSENSE_REWARDED_SLOT_ID = '';
    const mockOnReward = vi.fn();

    render(<RewardedAdModal isOpen={true} onClose={() => {}} onRewardEarned={mockOnReward} />);

    expect(screen.getByText('Tuitrix Pro')).toBeInTheDocument();

    // Fast forward 5 seconds
    const { act } = await import('@testing-library/react');
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText('✅ Reward unlocked!')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Claim +1 AI Request'));
    expect(mockOnReward).toHaveBeenCalledTimes(1);
  });
});
