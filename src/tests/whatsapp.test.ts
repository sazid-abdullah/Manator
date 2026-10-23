import { test, expect } from 'vitest';
import { generateWhatsAppMessage } from '../utils/whatsapp';

test('generateWhatsAppMessage English', () => {
  const result = generateWhatsAppMessage({
    studentName: 'John',
    lang: 'en',
    completedClasses: 5,
    targetClasses: 12,
    lastClassDate: '2023-10-01',
    lastClassTopic: 'Math',
    dueAmount: '6,000',
    tutorName: 'Tutor Ali',
    hasLastClass: true,
  });

  expect(result).toBe("Assalamu Alaikum, John has completed 5/12 classes for the current cycle (Last class: 2023-10-01 - Math). Total tuition fee due: ৳6,000. Thank you — Tutor Ali.");
});

test('generateWhatsAppMessage Bangla', () => {
  const result = generateWhatsAppMessage({
    studentName: 'John',
    lang: 'bn',
    completedClasses: 5,
    targetClasses: 12,
    lastClassDate: '2023-10-01',
    lastClassTopic: 'Math',
    dueAmount: '6,000',
    tutorName: 'Tutor Ali',
    hasLastClass: true,
  });

  expect(result).toBe("আসসালামু আলাইকুম, John-এর বর্তমান সাইকেলের 5/12টি ক্লাস সম্পন্ন হয়েছে (শেষ ক্লাস: 2023-10-01 - Math)। বকেয়া টিউশন ফি: ৳6,000। অনুগ্রহ করে পরিশোধের ব্যবস্থা করলে উপকৃত হব। ধন্যবাদ — Tutor Ali।");
});
