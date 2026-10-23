import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDueRemindersSummary } from '../services/notifications';
import { Student, Batch, Contract, Payment } from '../types';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

describe('playStorePwa and Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDueRemindersSummary calculates classes today and pending fees accurately', () => {
    // Mock today to be a Wednesday (day 3)
    vi.useFakeTimers();
    const mockDate = new Date(2025, 0, 15); // Jan 15 2025 is a Wednesday
    vi.setSystemTime(mockDate);

    const students: Student[] = [
      { id: 's1', name: 'Alice', active: true, schedule: [{ day: 3, time: '10:00', duration: 60 }] },
      { id: 's2', name: 'Bob', active: true, schedule: [{ day: 4, time: '10:00', duration: 60 }] }, // Different day
      { id: 's3', name: 'Charlie', active: true, batchId: 'b1' } // Managed by batch schedule
    ];

    const batches: Batch[] = [
      { id: 'b1', name: 'Batch 1', active: true, studentIds: ['s3'], schedule: [{ day: 3, time: '12:00', duration: 90 }] }
    ];

    const contracts: Contract[] = [
      { id: 'c1', studentId: 's1', title: 'Math', fee: 1000, cycleType: 'months', cycleLength: 1, startDate: '2025-01-01', billing: 'start', status: 'active' },
      { id: 'c2', studentId: 's2', title: 'Science', fee: 1000, cycleType: 'months', cycleLength: 1, startDate: '2025-01-01', billing: 'start', status: 'active' },
    ];

    // s1 paid, s2 hasn't paid
    const payments: Payment[] = [
      { id: 'p1', studentId: 's1', contractId: 'c1', amount: 1000, date: '2025-01-02' }
    ];

    const summary = getDueRemindersSummary(students, batches, contracts, payments);

    // Classes today: Alice (student schedule day 3) + Charlie (batch b1 schedule day 3) = 2
    expect(summary.classesToday).toBe(2);

    // Pending fees: s2 has no payment for active contract starting in past (Jan 1)
    expect(summary.pendingFees).toBe(1);

    vi.useRealTimers();
  });
});
