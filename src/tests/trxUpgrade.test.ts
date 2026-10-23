import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitTrxUpgradeRequest, fetchPendingUpgradeRequests, reviewUpgradeRequest } from '../services/firebase';

// Mock localStorage for local fallback testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('trxUpgrade functionality', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('submits an upgrade request locally when offline', async () => {
    const uid = 'test-uid';
    const email = 'test@example.com';
    const name = 'Test User';
    const payload = {
      method: 'bkash' as const,
      senderPhone: '01712345678',
      trxId: 'TRX1234567',
      amount: 99,
    };

    const req = await submitTrxUpgradeRequest(uid, email, name, payload);

    expect(req.uid).toBe(uid);
    expect(req.trxId).toBe(payload.trxId);
    expect(req.status).toBe('pending');

    const storedReq = JSON.parse(localStorage.getItem(`upgrade_req_${uid}`)!);
    expect(storedReq.id).toBe(req.id);
    expect(storedReq.status).toBe('pending');
  });

  it('fetches pending upgrade requests from local storage', async () => {
    const uid1 = 'uid-1';
    await submitTrxUpgradeRequest(uid1, 'user1@test.com', 'User 1', { method: 'bkash', senderPhone: '01711111111', trxId: 'TRX1', amount: 99 });
    const uid2 = 'uid-2';
    await submitTrxUpgradeRequest(uid2, 'user2@test.com', 'User 2', { method: 'nagad', senderPhone: '01722222222', trxId: 'TRX2', amount: 99 });

    const pendingReqs = await fetchPendingUpgradeRequests();

    expect(pendingReqs.length).toBe(2);
    expect(pendingReqs.map(r => r.uid)).toContain(uid1);
    expect(pendingReqs.map(r => r.uid)).toContain(uid2);
  });

  it('reviews an upgrade request and updates its status', async () => {
    const uid = 'review-uid';
    const req = await submitTrxUpgradeRequest(uid, 'review@test.com', 'Review User', { method: 'bkash', senderPhone: '01733333333', trxId: 'TRXREV', amount: 99 });

    await reviewUpgradeRequest(req.id, uid, 'approved');

    const storedReq = JSON.parse(localStorage.getItem(`upgrade_req_${uid}`)!);
    expect(storedReq.status).toBe('approved');
    expect(storedReq.reviewedAt).toBeDefined();

    const pendingReqs = await fetchPendingUpgradeRequests();
    expect(pendingReqs.find(r => r.id === req.id)).toBeUndefined();
  });
});
