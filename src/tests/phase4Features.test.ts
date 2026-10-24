import { describe, it, expect } from 'vitest';
import { canSaveAiResource, FREE_TIER_MAX_SAVED_RESOURCES } from '../utils/tierLimits';
import { generateWhatsAppMessage } from '../utils/whatsapp';
import { ExamScore } from '../types';

describe('Phase 4 Features', () => {
  describe('AI Resource Quota', () => {
    it('allows saving if user is pro regardless of count', () => {
      expect(canSaveAiResource(10, true)).toBe(true);
      expect(canSaveAiResource(100, true)).toBe(true);
    });

    it('allows saving if free tier user has not reached limit', () => {
      expect(canSaveAiResource(0, false)).toBe(true);
      expect(canSaveAiResource(4, false)).toBe(true);
    });

    it('blocks saving if free tier user has reached limit', () => {
      expect(canSaveAiResource(5, false)).toBe(false);
      expect(canSaveAiResource(6, false)).toBe(false);
    });
  });

  describe('WhatsApp Integration', () => {
    const defaultProps = {
      studentName: 'John Doe',
      lang: 'en' as const,
      completedClasses: 5,
      targetClasses: 10,
      dueAmount: '1000',
      tutorName: 'Jane Smith',
      hasLastClass: false,
    };

    it('includes latest exam result in English message', () => {
      const msg = generateWhatsAppMessage({
        ...defaultProps,
        lang: 'en',
        latestExamResult: { title: 'Midterm', percent: 85 }
      });
      expect(msg).toContain('Recent exam (Midterm) score: 85%');
    });

    it('includes latest exam result in Bangla message', () => {
      const msg = generateWhatsAppMessage({
        ...defaultProps,
        lang: 'bn',
        latestExamResult: { title: 'Midterm', percent: 85 }
      });
      expect(msg).toContain('সাম্প্রতিক পরীক্ষা (Midterm)-এ প্রাপ্ত নম্বর: 85%');
    });

    it('omits exam text if no latest exam result is passed', () => {
      const msg = generateWhatsAppMessage({
        ...defaultProps,
        lang: 'en'
      });
      expect(msg).not.toContain('Recent exam');
    });
  });

  describe('Exam Score Calculations', () => {
    it('calculates average and highest scores correctly', () => {
      const scores: ExamScore[] = [
        { id: '1', studentId: '1', title: 'Test 1', subject: 'Math', date: '2023-01-01', obtainedMarks: 8, totalMarks: 10 },
        { id: '2', studentId: '1', title: 'Test 2', subject: 'Math', date: '2023-01-02', obtainedMarks: 9, totalMarks: 10 },
        { id: '3', studentId: '1', title: 'Test 3', subject: 'Math', date: '2023-01-03', obtainedMarks: 15, totalMarks: 20 },
      ];

      const percents = scores.map(s => Math.round((s.obtainedMarks / s.totalMarks) * 100));
      expect(percents).toEqual([80, 90, 75]);

      const avgScore = Math.round(scores.reduce((sum, s) => sum + (s.obtainedMarks / s.totalMarks), 0) / scores.length * 100);
      expect(avgScore).toBe(82);

      const highestScore = Math.max(...percents);
      expect(highestScore).toBe(90);
    });
  });
});
