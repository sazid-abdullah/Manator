import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectGeminiBillingTier, fetchModelList } from '../services/ai';

const mockState = {
  settings: { tutorName: '', currency: '৳' },
  ai: {
    provider: 'gemini' as const,
    keys: { gemini: 'test-key' },
    models: { gemini: '' }
  },
  students: [], lessons: [], payments: [], docs: [], goals: []
};

// Mock global fetch
const originalFetch = global.fetch;

describe('AI Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('detectGeminiBillingTier', () => {
    it('returns free on 429 quota error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429
      });
      const tier = await detectGeminiBillingTier('test-key');
      expect(tier).toBe('free');
    });

    it('returns paid on 200 OK', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      });
      const tier = await detectGeminiBillingTier('test-key');
      expect(tier).toBe('paid');
    });
  });

  describe('fetchModelList', () => {
    it('filters out non-text models regardless of tier', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(':generateContent')) {
          return Promise.resolve({ ok: true, status: 200 }); // Paid tier
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { name: 'models/gemini-3.5-transcribe', displayName: 'Gemini 3.5 Transcribe', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/nano-banana-2.1', displayName: 'Nano Banana', supportedGenerationMethods: ['generateContent'] }
            ]
          })
        });
      });

      const result = await fetchModelList('gemini', mockState as any);
      expect(result.tier).toBe('paid');
      expect(result.list.length).toBe(1);
      expect(result.list[0].id).toBe('gemini-2.5-flash');
    });

    it('excludes paid-only models on Free Tier', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(':generateContent')) {
          return Promise.resolve({ ok: false, status: 429 }); // Free tier
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-4-argon', displayName: 'Gemini 4 Argon', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] }
            ]
          })
        });
      });

      const result = await fetchModelList('gemini', mockState as any);
      expect(result.tier).toBe('free');
      expect(result.list.length).toBe(2);
      expect(result.list.map(m => m.id).sort()).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'].sort());
    });

    it('includes paid Pro models on Paid Tier', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes(':generateContent')) {
          return Promise.resolve({ ok: true, status: 200 }); // Paid tier
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
            ]
          })
        });
      });

      const result = await fetchModelList('gemini', mockState as any);
      expect(result.tier).toBe('paid');
      expect(result.list.length).toBe(2);
      expect(result.list.map(m => m.id).sort()).toEqual(['gemini-2.5-flash', 'gemini-3.1-pro-preview'].sort());
    });
  });
});
