/**
 * @vitest-environment jsdom
 */
import { expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, vi, beforeEach } from 'vitest';
import { SettingsView } from '../views/SettingsView';
import * as context from '../store/context';
import * as aiServices from '../services/ai';

vi.mock('../services/firebase', () => ({
  auth: {},
  db: {},
  onAuthStateChanged: vi.fn(),
  fetchPricingConfig: vi.fn(() => Promise.resolve({ monthlyPrice: 99, yearlyPrice: 999, bkashNumber: '', nagadNumber: '', rocketNumber: '', promoText: '', updatedAt: 0 })),
  updatePricingConfig: vi.fn(),
  fetchPendingUpgradeRequests: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../services/ai', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    fetchModelList: vi.fn(),
    readModelCache: vi.fn(() => ({})),
    autoModel: vi.fn(() => 'gemini-2.5-flash'),
  };
});

const mockState = {
  settings: { tutorName: '', currency: '৳' },
  profile: { credentials: '', brandTitle: '', showPrintHeader: true, showPrintWatermark: true },
  ai: {
    provider: 'gemini',
    keys: { gemini: '' },
    models: { gemini: '' }
  },
  students: [], lessons: [], payments: [], docs: [],
};

const mockStore = {
  state: mockState,
  billingState: null,
  updateSettings: vi.fn(),
  updateProfile: vi.fn(),
  updateAI: vi.fn(),
  loadDemoData: vi.fn(),
  eraseAllData: vi.fn(),
  exportBackup: vi.fn(),
  importBackup: vi.fn(),
  downloadFile: vi.fn(),
  toast: vi.fn(),
};

vi.spyOn(context, 'useStore').mockReturnValue(mockStore as any);

describe('SettingsView AI Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithStore = () => {
    return render(<SettingsView />);
  };

  it('renders a select dropdown for models with Auto default', async () => {
    await act(async () => {
      renderWithStore();
    });
    const select = screen.getByRole('combobox', { name: /Model/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Auto default/i })).toBeInTheDocument();
  });

  it('calls fetchModelList when API key is entered (debounced)', async () => {
    (aiServices.fetchModelList as any).mockResolvedValue({
      list: [
        { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' },
        { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro' }
      ],
      tier: 'free'
    });

    await act(async () => {
      renderWithStore();
    });

    const apiKeyInput = screen.getAllByPlaceholderText(/Paste your Google Gemini API key/i)[0];
    fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } });

    await waitFor(() => {
      expect(aiServices.fetchModelList).toHaveBeenCalled();
    }, { timeout: 1500 });
  });

  it('shows loaded models message when models are fetched', async () => {
    (aiServices.fetchModelList as any).mockResolvedValue({
      list: [
        { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash' },
      ],
      tier: 'free'
    });

    await act(async () => {
      renderWithStore();
    });

    const button = screen.getAllByRole('button', { name: /Refresh model list/i })[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Free Tier API key detected — showing 1 free-tier compatible models')).toBeInTheDocument();
    }, { timeout: 1500 });
  });

  it('gracefully falls back when fetchModelList fails', async () => {
    (aiServices.fetchModelList as any).mockRejectedValue(new Error('API failed'));

    await act(async () => {
      renderWithStore();
    });

    const button = screen.getAllByRole('button', { name: /Refresh model list/i })[0];
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Using default fallback models')).toBeInTheDocument();
    }, { timeout: 1500 });
  });
});
