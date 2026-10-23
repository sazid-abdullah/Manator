import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, BillingState, Student, Batch, Contract, Lesson, Payment, Expense, Goal, SavedDoc, Exam, Attempt, ToastMessage, SyncStatus, ExamScore, SavedAiResource } from '../types';
import { todayISO, addDays, addMonths, parseISO, uid } from '../utils/date';
import { isOwnerEmail } from '../utils/auth';
import { auth, db, onAuthStateChanged } from '../services/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

const STORE_KEY = 'tuitrix_data';
const STORE_VERSION = 1;

function defaultState(): AppState {
  return {
    version: STORE_VERSION,
    settings: { tutorName: '', currency: '৳', lastBackup: null },
    profile: { credentials: '', brandTitle: '', showPrintHeader: true, showPrintWatermark: true },
    ai: { provider: 'gemini', models: {}, keys: {} },
    students: [],
    batches: [],
    lessons: [],
    contracts: [],
    payments: [],
    expenses: [],
    docs: [],
    savedResources: [],
    goals: [],
    exams: [],
    attempts: [],
    promoCodes: [],
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      settings: { ...defaultState().settings, ...(parsed.settings || {}) },
      profile: { ...defaultState().profile, ...(parsed.profile || {}) },
      ai: { ...defaultState().ai, ...(parsed.ai || {}) },
      batches: Array.isArray(parsed.batches) ? parsed.batches : [],
      savedResources: Array.isArray(parsed.savedResources) ? parsed.savedResources : [],
      promoCodes: Array.isArray(parsed.promoCodes) ? parsed.promoCodes : [],
    };
  } catch (e) {
    console.error('Failed to load state', e);
    return defaultState();
  }
}

interface StoreContextType {
  state: AppState;
  billingState: BillingState | null;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  syncStatus: SyncStatus;
  lastSyncedAt?: string;
  toasts: ToastMessage[];
  toast: (msg: string, type?: 'info' | 'error' | 'success', action?: { label: string; fn: () => void }) => void;
  dismissToast: (id: string) => void;
  money: (n: number | string) => string;
  getStudent: (id: string) => Student | undefined;
  getContract: (id: string) => Contract | undefined;
  studentName: (id: string) => string;
  saveStudent: (student: Omit<Student, 'id'> & { id?: string }) => string;
  deleteStudent: (id: string) => boolean;
  saveBatch: (batch: Omit<Batch, 'id'> & { id?: string }) => string;
  deleteBatch: (id: string) => boolean;
  saveContract: (contract: Omit<Contract, 'id'> & { id?: string }) => string;
  deleteContract: (id: string) => boolean;
  saveLesson: (lesson: Omit<Lesson, 'id'> & { id?: string }) => string;
  logBatchLesson: (opts: {
    batchId: string;
    date: string;
    time?: string;
    duration?: number | null;
    subject?: string;
    topics?: string;
    homework?: string;
    notes?: string;
    attendance: Record<string, Lesson['status']>; // studentId -> status
    batchSessionId?: string;
  }) => void;
  deleteLesson: (id: string) => void;
  savePayment: (payment: Omit<Payment, 'id'> & { id?: string }) => string;
  deletePayment: (id: string) => void;
  saveExpense: (expense: Omit<Expense, 'id'> & { id?: string }) => string;
  deleteExpense: (id: string) => void;
  saveGoal: (goal: Omit<Goal, 'id'> & { id?: string }) => string;
  deleteGoal: (id: string) => void;
  depositGoal: (id: string, amount: number) => void;
  saveDoc: (doc: Omit<SavedDoc, 'id'> & { id?: string }) => string;
  deleteDoc: (id: string) => void;
  addExamScore: (studentId: string, score: Omit<ExamScore, 'id'> & { id?: string }) => string;
  deleteExamScore: (studentId: string, scoreId: string) => void;
  saveAiResource: (resource: Omit<SavedAiResource, 'id'> & { id?: string }) => string;
  deleteAiResource: (id: string) => void;
  toggleFavoriteAiResource: (id: string) => void;
  saveExam: (exam: Omit<Exam, 'id'> & { id?: string }) => string;
  saveAttempt: (attempt: Attempt) => void;
  deleteAttempt: (id: string) => void;
  updateSettings: (settings: Partial<AppState['settings']>) => void;
  updateProfile: (profile: Partial<AppState['profile']>) => void;
  updateAI: (ai: Partial<AppState['ai']>) => void;
  loadDemoData: () => void;
  eraseAllData: () => void;
  exportBackup: (includeKeys?: boolean) => string;
  importBackup: (text: string) => void;
  downloadFile: (name: string, content: string, type?: string) => void;
  isStateLoaded: boolean;
}

const StoreContext = createContext<StoreContextType | null>(null);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(loadState);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [billingState, setBillingState] = useState<BillingState | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();
  const isMigratingRef = useRef(false);
  const authLoadedRef = useRef(false);

  // Firestore sync and migration
  useEffect(() => {
    let unsubscribeBilling: () => void;

    let unsubscribe: () => void = () => {};
    if (auth) { unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const isOwner = isOwnerEmail(user.email);

        if (db) unsubscribeBilling = onSnapshot(doc(db, `users/${user.uid}/data/billing`), (billingDoc) => {
          if (isOwner) {
            const data = billingDoc.data() as BillingState | undefined;
            if (!billingDoc.exists() || data?.plan !== 'pro' || data?.credits < 999999) {
              // Sync owner billing state back to Firestore so it's always Pro
              const newState: BillingState = { plan: 'pro', credits: 999999, proUntil: Date.now() + 100 * 365 * 86400e3, updatedAt: Date.now(), transactions: data?.transactions || [] };
              if (db) setDoc(doc(db, `users/${user.uid}/data/billing`), newState).catch(console.error);
            } else {
              setBillingState(data);
            }
          } else if (billingDoc.exists()) {
            setBillingState(billingDoc.data() as BillingState);
          } else {
            setBillingState(null);
          }
        });

        authLoadedRef.current = true;
        try {
          if (!db) {
            setIsStateLoaded(true);
            return;
          }
          const docRef = doc(db, `users/${user.uid}/data/appState`);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            let remoteState = docSnap.data() as AppState;
            remoteState = {
              ...defaultState(),
              ...remoteState,
              settings: { ...defaultState().settings, ...(remoteState.settings || {}) },
              profile: { ...defaultState().profile, ...(remoteState.profile || {}) },
              ai: { ...defaultState().ai, ...(remoteState.ai || {}) },
              batches: Array.isArray(remoteState.batches) ? remoteState.batches : [],
              promoCodes: Array.isArray(remoteState.promoCodes) ? remoteState.promoCodes : [],
            };
            if (isOwner && (!remoteState.isOwner || !remoteState.isAdmin || remoteState.role !== 'owner')) {
               remoteState = { ...remoteState, isOwner: true, isAdmin: true, role: 'owner' };
               await setDoc(docRef, remoteState);
            }
            setState(remoteState);
            setIsStateLoaded(true);
            localStorage.setItem(STORE_KEY, JSON.stringify(remoteState));
          } else {
            // Document doesn't exist, check if local state needs migrating
            const localRaw = localStorage.getItem(STORE_KEY);
            let needsMigration = false;
            let dataToUpload = state;
            if (localRaw) {
               const localParsed = JSON.parse(localRaw) as AppState;
               // Heuristic to see if it's not empty
               if (localParsed.students && localParsed.students.length > 0 || localParsed.settings?.tutorName) {
                 needsMigration = true;
                 dataToUpload = localParsed;
               }
            }
            if (isOwner) {
               dataToUpload = { ...dataToUpload, isOwner: true, isAdmin: true, role: 'owner' };
            }
            if (needsMigration) {
               isMigratingRef.current = true;
               await setDoc(docRef, dataToUpload);
               isMigratingRef.current = false;
               setState(dataToUpload);
            } else {
               await setDoc(docRef, dataToUpload);
               setState(dataToUpload);
            }
            setIsStateLoaded(true);
          }
        } catch (error) {
          console.error("Error syncing with Firestore:", error);
          setIsStateLoaded(true);
        }
      } else {
        // user logged out or guest mode
        if (authLoadedRef.current) {
          // This means a user was previously logged in during this session and just logged out
          // Clear their data from local storage so it doesn't leak into guest mode
          localStorage.removeItem(STORE_KEY);
          setState(defaultState());
        } else {
          // Normal guest mode load
          setState(loadState());
        }
        setBillingState(null);
        if (unsubscribeBilling) unsubscribeBilling();
        authLoadedRef.current = false;
        setIsStateLoaded(true);
      }
    });
    } else {
      setIsStateLoaded(true);
    }

    const handleOnline = () => {
      if (auth?.currentUser) {
        setSyncStatus('syncing'); // or let next sync push set it
      } else {
        setSyncStatus('local');
      }
    };
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine) {
      setSyncStatus('offline');
    }

    return () => {
      unsubscribe();
      if (unsubscribeBilling) unsubscribeBilling();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // state shouldn't be here since we upload dataToUpload

  // Persist state changes
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));

      if (!navigator.onLine) {
        setSyncStatus('offline');
        return;
      }

      // Write to firestore if logged in and not currently migrating
      const user = auth?.currentUser;
      if (user && authLoadedRef.current && !isMigratingRef.current) {
        if (db) {
          setSyncStatus('syncing');
          const docRef = doc(db, `users/${user.uid}/data/appState`);
          setDoc(docRef, state)
            .then(() => {
              setSyncStatus('synced');
              setLastSyncedAt(new Date().toISOString());
            })
            .catch(e => {
              console.error('Failed to save to Firestore', e);
              setSyncStatus('error');
            });
        }
      } else if (!user) {
        setSyncStatus('local');
      }
    } catch (e) {
      console.error('Failed to save state', e);
      if (navigator.onLine && auth?.currentUser) {
        setSyncStatus('error');
      }
    }
  }, [state]);

  // Sync across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY && e.newValue) {
        try {
          setState(JSON.parse(e.newValue));
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info', action?: { label: string; fn: () => void }) => {
    const id = uid();
    setToasts(prev => [...prev, { id, msg, type, action }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? 6000 : 3500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const money = useCallback((n: number | string) => {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const sign = v < 0 ? '-' : '';
    return `${sign}${state.settings.currency || ''}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }, [state.settings.currency]);

  const getStudent = useCallback((id: string) => state.students.find(s => s.id === id), [state.students]);
  const getContract = useCallback((id: string) => state.contracts.find(c => c.id === id), [state.contracts]);
  const studentName = useCallback((id: string) => state.students.find(s => s.id === id)?.name || 'Unknown student', [state.students]);

  const saveStudent = useCallback((student: Omit<Student, 'id'> & { id?: string }) => {
    const id = student.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.students.some(s => s.id === id);
      const updated = exists
        ? prev.students.map(s => s.id === id ? { ...s, ...student, id } : s)
        : [...prev.students, { ...student, id, active: student.active !== false, createdAt: student.createdAt || now }];
      return { ...prev, students: updated };
    });
    return id;
  }, []);

  const deleteStudent = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      students: prev.students.filter(s => s.id !== id),
      contracts: prev.contracts.filter(c => c.studentId !== id),
      lessons: prev.lessons.filter(l => l.studentId !== id),
      payments: prev.payments.filter(p => p.studentId !== id),
      attempts: prev.attempts.filter(a => a.studentId !== id),
      docs: prev.docs.map(d => d.studentId === id ? { ...d, studentId: null } : d),
    }));
    return true;
  }, []);

  const saveBatch = useCallback((batch: Omit<Batch, 'id'> & { id?: string }) => {
    const id = batch.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const batches = prev.batches || [];
      const exists = batches.some(b => b.id === id);
      const updated = exists
        ? batches.map(b => b.id === id ? { ...b, ...batch, id } : b)
        : [...batches, { ...batch, id, active: batch.active !== false, createdAt: batch.createdAt || now }];
      return { ...prev, batches: updated };
    });
    return id;
  }, []);

  const deleteBatch = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      batches: (prev.batches || []).filter(b => b.id !== id),
    }));
    return true;
  }, []);

  const saveContract = useCallback((contract: Omit<Contract, 'id'> & { id?: string }) => {
    const id = contract.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.contracts.some(c => c.id === id);
      let updatedContracts: Contract[];
      let updatedLessons = prev.lessons;

      if (exists) {
        updatedContracts = prev.contracts.map(c => c.id === id ? { ...c, ...contract, id } : c);
      } else {
        const nc = { ...contract, id, createdAt: contract.createdAt || now };
        updatedContracts = [...prev.contracts, nc];
        // Link this student's unassigned classes since start date
        updatedLessons = prev.lessons.map(l => {
          if (l.studentId === contract.studentId && !l.contractId && l.date >= nc.startDate) {
            return { ...l, contractId: nc.id };
          }
          return l;
        });
      }
      return { ...prev, contracts: updatedContracts, lessons: updatedLessons };
    });
    return id;
  }, []);

  const deleteContract = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      contracts: prev.contracts.filter(c => c.id !== id),
      lessons: prev.lessons.map(l => l.contractId === id ? { ...l, contractId: null } : l),
      payments: prev.payments.map(p => p.contractId === id ? { ...p, contractId: null } : p),
    }));
    return true;
  }, []);

  const saveLesson = useCallback((lesson: Omit<Lesson, 'id'> & { id?: string }) => {
    const id = lesson.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.lessons.some(l => l.id === id);
      const updated = exists
        ? prev.lessons.map(l => l.id === id ? { ...l, ...lesson, id } : l)
        : [...prev.lessons, { ...lesson, id, createdAt: lesson.createdAt || now }];
      return { ...prev, lessons: updated };
    });
    return id;
  }, []);

  const logBatchLesson = useCallback((opts: {
    batchId: string;
    date: string;
    time?: string;
    duration?: number | null;
    subject?: string;
    topics?: string;
    homework?: string;
    notes?: string;
    attendance: Record<string, Lesson['status']>; // studentId -> status
    batchSessionId?: string;
  }) => {
    const batchSessionId = opts.batchSessionId || uid();
    const now = new Date().toISOString();

    setState(prev => {
      const batch = (prev.batches || []).find(b => b.id === opts.batchId);
      if (!batch) return prev;

      let newLessons = [...prev.lessons];

      batch.studentIds.forEach(studentId => {
        const status = opts.attendance[studentId] || 'taught';

        // Check if there's an existing lesson for this student in this batch session
        const existingLessonIndex = opts.batchSessionId
          ? newLessons.findIndex(l => l.batchSessionId === opts.batchSessionId && l.studentId === studentId)
          : -1;

        if (existingLessonIndex >= 0) {
           // Update existing lesson
           newLessons[existingLessonIndex] = {
              ...newLessons[existingLessonIndex],
              date: opts.date,
              time: opts.time,
              duration: opts.duration,
              status,
              subject: opts.subject,
              topics: opts.topics,
              homework: opts.homework,
              notes: opts.notes,
           };
        } else {
          // Find active contract for student
          const activeContract = prev.contracts.find(
            c => c.studentId === studentId && c.status !== 'ended' && c.startDate <= opts.date
          );

          newLessons.push({
            id: uid(),
            studentId,
            batchId: opts.batchId,
            batchSessionId,
            contractId: activeContract?.id || null,
            date: opts.date,
            time: opts.time,
            duration: opts.duration,
            status,
            subject: opts.subject,
            topics: opts.topics,
            homework: opts.homework,
            notes: opts.notes,
            createdAt: now,
          });
        }
      });

      return {
        ...prev,
        lessons: newLessons,
      };
    });
  }, []);

  const deleteLesson = useCallback((id: string) => {
    setState(prev => {
      const target = prev.lessons.find(l => l.id === id);
      if (!target) return prev;
      return { ...prev, lessons: prev.lessons.filter(l => l.id !== id) };
    });
  }, []);

  const savePayment = useCallback((payment: Omit<Payment, 'id'> & { id?: string }) => {
    const id = payment.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.payments.some(p => p.id === id);
      const updated = exists
        ? prev.payments.map(p => p.id === id ? { ...p, ...payment, id } : p)
        : [...prev.payments, { ...payment, id, createdAt: payment.createdAt || now }];
      return { ...prev, payments: updated };
    });
    return id;
  }, []);

  const deletePayment = useCallback((id: string) => {
    setState(prev => ({ ...prev, payments: prev.payments.filter(p => p.id !== id) }));
  }, []);

  const saveExpense = useCallback((expense: Omit<Expense, 'id'> & { id?: string }) => {
    const id = expense.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.expenses.some(e => e.id === id);
      const updated = exists
        ? prev.expenses.map(e => e.id === id ? { ...e, ...expense, id } : e)
        : [...prev.expenses, { ...expense, id, createdAt: expense.createdAt || now }];
      return { ...prev, expenses: updated };
    });
    return id;
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setState(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
  }, []);

  const saveGoal = useCallback((goal: Omit<Goal, 'id'> & { id?: string }) => {
    const id = goal.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.goals.some(g => g.id === id);
      const updated = exists
        ? prev.goals.map(g => g.id === id ? { ...g, ...goal, id } : g)
        : [...prev.goals, { ...goal, id, createdAt: goal.createdAt || now }];
      return { ...prev, goals: updated };
    });
    return id;
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setState(prev => ({ ...prev, goals: prev.goals.filter(g => g.id !== id) }));
  }, []);

  const depositGoal = useCallback((id: string, amount: number) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => g.id === id ? { ...g, saved: Math.max(0, (Number(g.saved) || 0) + amount) } : g),
    }));
  }, []);

  const saveDoc = useCallback((doc: Omit<SavedDoc, 'id'> & { id?: string }) => {
    const id = doc.id || uid();
    const now = new Date().toISOString();
    setState(prev => {
      const exists = prev.docs.some(d => d.id === id);
      const updated = exists
        ? prev.docs.map(d => d.id === id ? { ...d, ...doc, id } : d)
        : [...prev.docs, { ...doc, id, createdAt: doc.createdAt || now }];
      return { ...prev, docs: updated };
    });
    return id;
  }, []);

  const deleteDoc = useCallback((id: string) => {
    setState(prev => ({ ...prev, docs: prev.docs.filter(d => d.id !== id) }));
  }, []);

  const addExamScore = useCallback((studentId: string, score: Omit<ExamScore, 'id'> & { id?: string }) => {
    const finalScore = { ...score, id: score.id || uid(), studentId } as ExamScore;
    setState(s => {
      const student = s.students.find(st => st.id === studentId);
      if (!student) return s;
      const currentScores = student.examScores || [];
      const updatedScores = score.id
        ? currentScores.map(sc => sc.id === score.id ? finalScore : sc)
        : [...currentScores, finalScore];

      return {
        ...s,
        students: s.students.map(st => st.id === studentId ? { ...st, examScores: updatedScores } : st)
      };
    });
    return finalScore.id;
  }, []);

  const deleteExamScore = useCallback((studentId: string, scoreId: string) => {
    setState(s => {
      const student = s.students.find(st => st.id === studentId);
      if (!student) return s;
      const currentScores = student.examScores || [];
      return {
        ...s,
        students: s.students.map(st => st.id === studentId ? { ...st, examScores: currentScores.filter(sc => sc.id !== scoreId) } : st)
      };
    });
  }, []);

  const saveAiResource = useCallback((resource: Omit<SavedAiResource, 'id'> & { id?: string }) => {
    const isNew = !resource.id;
    const finalRes = { ...resource, id: resource.id || uid() } as SavedAiResource;
    setState(s => ({
      ...s,
      savedResources: isNew ? [finalRes, ...(s.savedResources || [])] : (s.savedResources || []).map(r => (r.id === finalRes.id ? finalRes : r)),
    }));
    return finalRes.id;
  }, []);

  const deleteAiResource = useCallback((id: string) => {
    setState(s => ({ ...s, savedResources: (s.savedResources || []).filter(r => r.id !== id) }));
  }, []);

  const toggleFavoriteAiResource = useCallback((id: string) => {
    setState(s => ({
      ...s,
      savedResources: (s.savedResources || []).map(r => r.id === id ? { ...r, isFavorite: !r.isFavorite } : r)
    }));
  }, []);

  const saveExam = useCallback((exam: Omit<Exam, 'id'> & { id?: string }) => {
    const id = exam.id || uid();
    setState(prev => {
      const exists = prev.exams.some(e => e.id === id);
      const updated = exists
        ? prev.exams.map(e => e.id === id ? { ...e, ...exam, id } : e)
        : [...prev.exams, { ...exam, id }];
      return { ...prev, exams: updated };
    });
    return id;
  }, []);

  const saveAttempt = useCallback((attempt: Attempt) => {
    setState(prev => {
      const exists = prev.attempts.some(a => a.id === attempt.id);
      const updated = exists
        ? prev.attempts.map(a => a.id === attempt.id ? attempt : a)
        : [...prev.attempts, attempt];
      return { ...prev, attempts: updated };
    });
  }, []);

  const deleteAttempt = useCallback((id: string) => {
    setState(prev => ({ ...prev, attempts: prev.attempts.filter(a => a.id !== id) }));
  }, []);

  const updateSettings = useCallback((settings: Partial<AppState['settings']>) => {
    setState(prev => ({ ...prev, settings: { ...prev.settings, ...settings } }));
  }, []);

  const updateProfile = useCallback((profile: Partial<AppState['profile']>) => {
    setState(prev => ({ ...prev, profile: { ...prev.profile, ...profile } }));
  }, []);

  const updateAI = useCallback((ai: Partial<AppState['ai']>) => {
    setState(prev => ({ ...prev, ai: { ...prev.ai, ...ai } }));
  }, []);

  const loadDemoData = useCallback(() => {
    const t = todayISO();
    const mk = (o: any): Student => ({ id: uid(), active: true, createdAt: new Date().toISOString(), phone: '', address: '', notes: '', ...o });
    const rahim = mk({ name: 'Rahim Ahmed', grade: 'Class 8', curriculum: 'National (Bangla medium)', subjects: ['Math', 'Science'], guardianName: 'Karim Ahmed', guardianPhone: '01711000000', schedule: [{ day: 6, time: '17:00', duration: 60 }, { day: 1, time: '17:00', duration: 60 }, { day: 3, time: '17:00', duration: 60 }] });
    const nusrat = mk({ name: 'Nusrat Jahan', grade: 'Class 10 (SSC)', curriculum: 'National (English version)', subjects: ['Physics', 'Chemistry'], guardianName: 'Salma Begum', guardianPhone: '01811000000', schedule: [{ day: 0, time: '19:00', duration: 90 }, { day: 2, time: '19:00', duration: 90 }, { day: 4, time: '19:00', duration: 90 }] });
    const tanvir = mk({ name: 'Tanvir Hasan', grade: 'O Level', curriculum: 'Cambridge', subjects: ['Mathematics D'], guardianName: 'Farzana Hasan', guardianPhone: '', schedule: [{ day: 5, time: '10:00', duration: 120 }] });
    
    const students = [rahim, nusrat, tanvir];
    const contracts: Contract[] = [
      { id: uid(), studentId: rahim.id, title: 'Math & Science', fee: 3000, cycleType: 'classes', cycleLength: 12, startDate: addDays(t, -42), billing: 'end', status: 'active', notes: '' },
      { id: uid(), studentId: nusrat.id, title: 'Physics & Chemistry', fee: 4000, cycleType: 'months', cycleLength: 1, startDate: addDays(addMonths(t, -2), -5), billing: 'end', status: 'active', notes: '' },
      { id: uid(), studentId: tanvir.id, title: 'Mathematics D', fee: 5000, cycleType: 'days', cycleLength: 30, startDate: addDays(t, -20), billing: 'start', status: 'active', notes: '' },
    ];
    
    const topics: Record<string, string[]> = {
      Math: ['Algebraic expressions: like terms', 'Factorisation: a² − b²', 'Linear equations in one variable', 'Word problems on equations', 'Ratio and proportion', 'Profit and loss', 'Area of triangles and quadrilaterals'],
      Science: ['Cell structure and functions', 'Photosynthesis', 'Acids, bases and salts', 'Force and pressure', 'Light: reflection'],
      Physics: ['Motion: velocity and acceleration', 'Newton’s laws of motion', 'Work, power and energy', 'Pressure in liquids', 'Heat and temperature', 'Waves and sound'],
      Chemistry: ['Atomic structure', 'Periodic table trends', 'Chemical bonding', 'Mole concept', 'Acids, bases and pH'],
      'Mathematics D': ['Sets and Venn diagrams', 'Indices and surds', 'Quadratic equations', 'Simultaneous equations', 'Trigonometry: SOH CAH TOA', 'Vectors'],
    };

    const lessons: Lesson[] = [];
    for (const s of students) {
      const c = contracts.find(x => x.studentId === s.id)!;
      let i = 0;
      for (let day = c.startDate; day < t; day = addDays(day, 1)) {
        const slot = (s.schedule || []).find(x => x.day === parseISO(day).getDay());
        if (!slot) continue;
        const subject = s.subjects![i % s.subjects!.length];
        const list = topics[subject] || ['General revision'];
        const absent = i % 9 === 7;
        lessons.push({
          id: uid(), studentId: s.id, contractId: c.id, date: day, time: slot.time, duration: slot.duration,
          subject, status: absent ? 'absent' : 'taught',
          topics: absent ? '' : list[Math.floor(i / s.subjects!.length) % list.length],
          homework: absent ? '' : (i % 2 ? 'Exercise questions 1–10' : "Revise today's notes"),
          notes: '', createdAt: new Date().toISOString()
        });
        i++;
      }
    }

    const payments: Payment[] = [
      { id: uid(), studentId: rahim.id, contractId: contracts[0].id, amount: 3000, date: addDays(t, -12), method: 'Cash', note: 'First 12 classes' },
      { id: uid(), studentId: nusrat.id, contractId: contracts[1].id, amount: 4000, date: addDays(addMonths(t, -1), -3), method: 'bKash', note: '' },
      { id: uid(), studentId: tanvir.id, contractId: contracts[2].id, amount: 5000, date: addDays(t, -20), method: 'Bank', note: 'Advance' },
    ];

    const expenses: Expense[] = [
      { id: uid(), amount: 600, date: addDays(t, -6), category: 'Transport', note: 'Rickshaw & bus' },
      { id: uid(), amount: 250, date: addDays(t, -15), category: 'Printing', note: 'Model test papers' },
      { id: uid(), amount: 450, date: addDays(addMonths(t, -1), -2), category: 'Transport', note: '' },
    ];

    const goals: Goal[] = [
      { id: uid(), name: 'New laptop', target: 65000, saved: 12000, targetDate: addMonths(todayISO(), 6), createdAt: new Date().toISOString() }
    ];

    setState(prev => ({
      ...prev,
      students: [...prev.students, ...students],
      contracts: [...prev.contracts, ...contracts],
      lessons: [...prev.lessons, ...lessons],
      payments: [...prev.payments, ...payments],
      expenses: [...prev.expenses, ...expenses],
      goals: [...prev.goals, ...goals],
    }));
  }, []);

  const eraseAllData = useCallback(() => {
    setState(prev => ({
      ...defaultState(),
      ai: prev.ai,
    }));
  }, []);

  const exportBackup = useCallback((includeKeys: boolean = false) => {
    const copy = JSON.parse(JSON.stringify(state));
    if (!includeKeys) copy.ai.keys = {};
    copy.exportedAt = new Date().toISOString();
    return JSON.stringify(copy, null, 2);
  }, [state]);

  const importBackup = useCallback((text: string) => {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('This file is not a Tuitrix backup.'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.students) || !Array.isArray(data.lessons) || !Array.isArray(data.contracts) || !Array.isArray(data.payments)) {
      throw new Error('This file is not a Tuitrix backup.');
    }
    const currentKeys = state.ai.keys;
    setState({
      ...defaultState(),
      ...data,
      settings: { ...defaultState().settings, ...(data.settings || {}) },
      profile: { ...defaultState().profile, ...(data.profile || {}) },
      ai: {
        ...defaultState().ai,
        ...(data.ai || {}),
        keys: Object.keys(data.ai?.keys || {}).length ? data.ai.keys : currentKeys,
      },
      batches: Array.isArray(data.batches) ? data.batches : [],
      promoCodes: Array.isArray(data.promoCodes) ? data.promoCodes : [],
    });
  }, [state.ai.keys]);

  const downloadFile = useCallback((name: string, content: string, type: string = 'application/octet-stream') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  return (
    <StoreContext.Provider value={{
      state,
      billingState,
      setState,
      syncStatus,
      lastSyncedAt,
      toasts,
      toast,
      dismissToast,
      money,
      getStudent,
      getContract,
      studentName,
      saveStudent,
      deleteStudent,
      saveContract,
      deleteContract,
      saveBatch,
      deleteBatch,
      saveLesson,
      logBatchLesson,
      deleteLesson,
      savePayment,
      deletePayment,
      saveExpense,
      deleteExpense,
      saveGoal,
      deleteGoal,
      depositGoal,
      saveDoc,
      deleteDoc,
        addExamScore,
        deleteExamScore,
        saveAiResource,
        deleteAiResource,
        toggleFavoriteAiResource,
      saveExam,
      saveAttempt,
      deleteAttempt,
      updateSettings,
      updateProfile,
      updateAI,
      loadDemoData,
      eraseAllData,
      exportBackup,
      importBackup,
      downloadFile,
      isStateLoaded,
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
