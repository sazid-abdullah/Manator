import { getMessaging, getToken, Messaging } from 'firebase/messaging';
import { app, auth, db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Student, Batch, Contract } from '../types';
import { todayISO, WEEKDAYS, parseISO } from '../utils/date';

let messaging: Messaging | null = null;
if (app && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    // Only attempt to initialize messaging if it is supported (avoids vitest crashes)
    import('firebase/messaging').then(({ isSupported, getMessaging }) => {
      isSupported().then(supported => {
        if (supported) {
          try {
             messaging = getMessaging(app);
          } catch(e) {}
        }
      });
    });
  } catch (e) {
    console.warn('Firebase Messaging not supported or failed to initialize:', e);
  }
}

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return 'denied';
  }
  return await Notification.requestPermission();
};

export const registerFcmToken = async (uid: string): Promise<string | null> => {
  if (!messaging) return null;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn('VITE_FIREBASE_VAPID_KEY is not configured for FCM.');
    return null;
  }

  try {
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey });
      if (token && db) {
        // Save to tutor's profile or user doc
        await updateDoc(doc(db, `users/${uid}/data/appState`), {
          'fcmToken': token
        }).catch(e => {
            console.warn("Could not save fcmToken", e);
        });
      }
      return token;
    }
  } catch (e) {
    console.warn('FCM Token registration failed:', e);
  }
  return null;
};

export const sendLocalReminderNotification = async (title: string, body: string, tag?: string): Promise<boolean> => {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration) {
        await registration.showNotification(title, {
          body,
          icon: '/icons/icon.svg',
          tag: tag || 'tuitrix-reminder',
          vibrate: [200, 100, 200],
        });
        return true;
      }
    }

    // Fallback
    new Notification(title, { body, icon: '/icons/icon.svg', tag });
    return true;
  } catch (e) {
    console.warn('Local notification failed:', e);
    return false;
  }
};

export const getDueRemindersSummary = (
  students: Student[],
  batches: Batch[],
  contracts: Contract[] = [],
  payments: any[] = []
): { classesToday: number; pendingFees: number } => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sun, 6 = Sat
  const todayStr = todayISO();

  let classesToday = 0;

  // Count classes for students
  students.forEach(s => {
    if (s.active && s.schedule && !s.batchId) {
      if (s.schedule.some(slot => slot.day === dayOfWeek)) {
        classesToday++;
      }
    }
  });

  // Count classes for batches
  batches.forEach(b => {
    if (b.active && b.schedule) {
      if (b.schedule.some(slot => slot.day === dayOfWeek)) {
        classesToday += b.studentIds.length;
      }
    }
  });

  // Since actual fee calculation can be complex (relying on cycles and logic in Contracts tab),
  // we do a simple approximation for the summary.
  let pendingFees = 0;

  const activeContracts = contracts.filter(c => c.status === 'active');

  activeContracts.forEach(c => {
    const student = students.find(s => s.id === c.studentId);
    if (!student || !student.active) return;

    // Simplified logic: If billing is "start" and start date is <= today,
    // or if a cycle has passed. To be accurate, we'd need full cycle calculation.
    // For now we check if there's any payment made. If no payment for an active contract started in past, it's pending.
    const hasPayment = payments.some(p => p.contractId === c.id);
    const startDate = parseISO(c.startDate);
    if (!hasPayment && startDate <= today) {
       pendingFees++;
    }
  });

  return { classesToday, pendingFees };
};
