export type CycleType = 'days' | 'months' | 'classes';
export type BillingType = 'start' | 'end';
export type LessonStatus = 'taught' | 'absent' | 'cancelled';
export type ExamQuestionType = 'mcq' | 'cq' | 'written';

export interface ScheduleSlot {
  day: number; // 0 = Sun, 6 = Sat
  time: string; // HH:mm
  duration: number; // minutes
}

export interface Batch {
  id: string;
  name: string;
  grade?: string;
  curriculum?: string;
  subjects?: string[];
  studentIds: string[];
  schedule?: ScheduleSlot[];
  defaultFee?: number;
  defaultCycleType?: CycleType;
  defaultCycleLength?: number;
  notes?: string;
  active?: boolean;
  createdAt?: string;
}

export interface Student {
  id: string;
  name: string;
  grade?: string;
  curriculum?: string;
  subjects?: string[];
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  address?: string;
  notes?: string;
  schedule?: ScheduleSlot[];
  active?: boolean;
  createdAt?: string;
  batchId?: string | null;
}

export interface Contract {
  id: string;
  studentId: string;
  title: string;
  fee: number;
  cycleType: CycleType;
  cycleLength: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  billing: BillingType;
  status: 'active' | 'ended';
  notes?: string;
  createdAt?: string;
}

export interface Lesson {
  id: string;
  studentId: string;
  contractId?: string | null;
  batchId?: string | null;
  batchSessionId?: string | null;
  date: string; // YYYY-MM-DD
  time?: string;
  duration?: number | null;
  status: LessonStatus;
  subject?: string;
  topics?: string;
  homework?: string;
  notes?: string;
  createdAt?: string;
}

export interface Payment {
  id: string;
  studentId: string;
  contractId?: string | null;
  amount: number;
  discountApplied?: number;
  promoCodeUsed?: string;
  planTerm?: 'monthly' | 'yearly';
  date: string; // YYYY-MM-DD
  method?: string;
  note?: string;
  createdAt?: string;
}

export interface Expense {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  note?: string;
  createdAt?: string;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  targetDate?: string;
  note?: string;
  createdAt?: string;
}

export interface SavedDoc {
  id: string;
  type: 'plan' | 'exam' | 'worksheet';
  title: string;
  content: string;
  studentId?: string | null;
  meta?: Record<string, any>;
  createdAt: string;
}

export interface MCQQuestion {
  id: string;
  n: string;
  type: 'mcq';
  stimulus?: string;
  text: string;
  figure?: string;
  options: string[];
  optionFigures?: string[];
  answer: number | null;
  guessed?: boolean;
  marks: number;
}

export interface CQPart {
  label: string;
  text: string;
  marks: number;
  answer?: string;
}

export interface CQQuestion {
  id: string;
  n: string;
  type: 'cq';
  stimulus?: string;
  figure?: string;
  parts: CQPart[];
}

export interface WrittenQuestion {
  id: string;
  n: string;
  type: 'written';
  text: string;
  figure?: string;
  marks: number;
  answer?: string;
}

export type Question = MCQQuestion | CQQuestion | WrittenQuestion;

export interface Exam {
  id: string;
  docId?: string | null;
  hash?: string;
  title: string;
  duration: number; // in minutes
  instructions?: string;
  cqChoose: number;
  questions: Question[];
  createdAt?: string;
}

export interface Attempt {
  id: string;
  examId: string;
  title: string;
  studentId?: string | null;
  startedAt: number;
  endsAt: number;
  submittedAt?: number | null;
  auto?: boolean;
  status: 'running' | 'submitted' | 'marked';
  answers: Record<string, any>;
  marks: Record<string, any>;
  aiMarks: Record<string, { marks: number; reason: string }>;
  flags?: string[];
  warned1?: boolean;
  warned5?: boolean;
}

export interface AppSettings {
  tutorName: string;
  currency: string;
  lastBackup?: string | null;
}

export interface TutorProfile {
  credentials?: string;
  brandTitle?: string;
  primarySubject?: string;
  showPrintHeader?: boolean;
  showPrintWatermark?: boolean;
}

export interface AIState {
  provider: 'gemini' | 'groq' | 'openrouter' | 'ollama';
  models: Record<string, string>;
  keys: Record<string, string>;
}

export interface TrxUpgradeRequest {
  id: string;
  uid: string;
  userEmail: string;
  userName?: string;
  method: 'bkash' | 'nagad' | 'rocket';
  senderPhone: string;
  trxId: string;
  amount: number;
  planTerm?: 'monthly' | 'yearly';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
}

export interface BillingState {
  plan: 'free' | 'pro';
  proUntil: number;
  credits: number;
  updatedAt: number;
  transactions: any[];
  pendingRequest?: { method: string; trxId: string; senderPhone: string; createdAt: string; status: 'pending' | 'approved' | 'rejected' };
}

export interface AppState {
  version: number;
  isOwner?: boolean;
  isAdmin?: boolean;
  role?: string;
  settings: AppSettings;
  profile?: TutorProfile;
  ai: AIState;
  students: Student[];
  batches?: Batch[];
  lessons: Lesson[];
  contracts: Contract[];
  payments: Payment[];
  expenses: Expense[];
  docs: SavedDoc[];
  goals: Goal[];
  exams: Exam[];
  attempts: Attempt[];
  promoCodes?: { code: string; discountType: 'flat' | 'percent'; value: number }[];
}


export interface PricingConfig {
  monthlyPrice: number;
  yearlyPrice: number;
  bkashNumber: string;
  nagadNumber: string;
  rocketNumber: string;
  promoText: string;
  updatedAt: number;
}

export interface ToastMessage {
  id: string;
  msg: string;
  type?: 'info' | 'error' | 'success';
  action?: { label: string; fn: () => void };
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

export interface DailyAiAdUsage {
  date: string; // YYYY-MM-DD in local time
  adsWatchedToday: number; // Max 5 per day on Free Tier
  requestsUsedToday: number; // Max 5 per day on Free Tier
  unlockedCredits: number; // Earned by watching an ad (1 ad = +1 credit), decremented (-1) when an AI request is sent
}
