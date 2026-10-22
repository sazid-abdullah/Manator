# Tuitrix - Architectural and Product Audit Report

This document contains a comprehensive, read-only architectural and product audit of the entire Tuitrix repository to assist in planning commercial scaling.

## 1. Project Tree & Tech Stack Inventory

### File Structure
**Root & Configs:**
- `.github/workflows/deploy.yml` - CI/CD for deployment (GitHub Pages target)
- `.gitignore`
- `README.md`
- `bun.lock` / `package.json` / `package-lock.json` - Node dependencies and scripts.
  - **Dependencies:** `firebase` (^13.0.0), `firebase-admin` (^14.5.0), `react` (^19.3.1), `react-dom` (^19.3.1).
  - **Dev Dependencies:** `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `jsdom`, `typescript`, `vite`, `vitest`.
  - **Build Scripts:** `dev` (vite --host 0.0.0.0 --port 3000), `build` (vite build), `lint` (tsc --noEmit), `preview` (vite preview), `start` (vite --host 0.0.0.0 --port 3000), `test` (vitest run).
- `firestore.rules` - Firebase Firestore security rules
- `index.html` - Main HTML entry for the Vite PWA
- `manifest.json` - PWA Manifest
- `service-worker.js` - Network-first service worker for PWA caching and offline mode
- `tsconfig.json` / `vite.config.ts` - TypeScript and Vite configurations
- `test_auth.py` / `test_settings.py` - Python tests

**Frontend Source (`src/`):**
- `App.tsx`, `main.tsx` - App entry points
- `types.ts` - Core TypeScript interfaces
- `vite-env.d.ts` - Vite environment variable types
- `components/` - Reusable UI components and modals:
  - `AuthModal.tsx`, `ConfirmModal.tsx`, `ContractModal.tsx`, `ExpenseModal.tsx`, `GoalDepositModal.tsx`, `GoalModal.tsx`, `ImportDocModal.tsx`, `LessonModal.tsx`, `Modal.tsx`, `Navbar.tsx`, `PaymentModal.tsx`, `StudentModal.tsx`, `ToastContainer.tsx`, `UploadPaperModal.tsx`
- `pages/` (Referred to as `views/` in the codebase):
  - `AIView.tsx`, `ClassesView.tsx`, `ExamView.tsx`, `HomeView.tsx`, `MoneyView.tsx`, `ResultView.tsx`, `SettingsView.tsx`, `StudentDetailView.tsx`, `StudentsView.tsx`
- `services/` - External integrations:
  - `ai.ts` - AI prompt definitions, text generation logic, model listing
  - `firebase.ts` - Firebase App, Auth, Firestore initialization
- `store/` - Global state management:
  - `context.tsx` - React Context provider for state (AppState, BillingState) and local storage sync
  - `contracts.ts` - Utility functions for contracts, money calculations
- `tests/` - Frontend tests (`ai.test.ts`, `auth.test.ts`, `SettingsView.test.tsx`, `setup.ts`)
- `utils/` - Utility functions (`auth.ts`, `date.ts`)

**Backend Source (`server/`):**
- `server.js` - Main Express/Node server
- `ai.js` - Server-side AI handling
- `db.js` - SQLite database handling
- `pay.js` - Payments logic (SSLCommerz)

**Assets:**
- `css/style.css` - Global CSS
- `icons/icon.svg` - PWA icon
- `js/` - Likely older or non-React JS assets / vendor scripts (e.g. PDF.js, Mammoth for Word parsing)

### Tech Stack
- **Frontend Framework:** React 19, TypeScript
- **Build Tool:** Vite
- **Global State:** React Context API + LocalStorage
- **Authentication:** Firebase Auth (Email/Password, Google Pop-up)
- **Realtime Database:** Firebase Firestore (for syncing AppState across devices)
- **Local Database (Backend):** SQLite (`better-sqlite3` implied by `db.js` functionality)
- **Testing:** Vitest, React Testing Library
- **PWA:** Native service worker, Web App Manifest
- **Optional Backend:** Node.js (v22.13+) serving a custom HTTP API (No Express used, raw Node `http` module used in `server.js`)
- **Backend Auth:** Firebase Admin SDK

## 2. Exact Data Models & State Schema

The exact schemas are defined in `src/types.ts`.

### Core Entities
- **`Student`**:
  ```typescript
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
    schedule?: ScheduleSlot[]; // { day: number, time: string, duration: number }
    active?: boolean;
    createdAt?: string;
  }
  ```
- **`Contract`**:
  ```typescript
  export type CycleType = 'days' | 'months' | 'classes';
  export type BillingType = 'start' | 'end';
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
  ```
- **`Lesson`** (Attendance/Schedule):
  ```typescript
  export type LessonStatus = 'taught' | 'absent' | 'cancelled';
  export interface Lesson {
    id: string;
    studentId: string;
    contractId?: string | null;
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
  ```
- **`Payment`**:
  ```typescript
  export interface Payment {
    id: string;
    studentId: string;
    contractId?: string | null;
    amount: number;
    date: string; // YYYY-MM-DD
    method?: string;
    note?: string;
    createdAt?: string;
  }
  ```
- **`Money` (Expense & Goal)**:
  ```typescript
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
  ```
- **`AISettings`**:
  ```typescript
  export interface AIState {
    provider: 'gemini' | 'groq' | 'openrouter' | 'ollama';
    models: Record<string, string>;
    keys: Record<string, string>;
  }
  ```
- **`Billing` / `Entitlements`**:
  ```typescript
  export interface BillingState {
    plan: 'free' | 'pro';
    proUntil: number;
    credits: number;
    updatedAt: number;
    transactions: any[];
  }
  ```
- **`User` / `Profile` (AppState)**:
  ```typescript
  export interface AppSettings {
    tutorName: string;
    currency: string;
    lastBackup?: string | null;
  }
  export interface AppState {
    version: number;
    isOwner?: boolean;
    isAdmin?: boolean;
    role?: string;
    settings: AppSettings;
    ai: AIState;
    students: Student[];
    lessons: Lesson[];
    contracts: Contract[];
    payments: Payment[];
    expenses: Expense[];
    docs: SavedDoc[];
    goals: Goal[];
    exams: Exam[];
    attempts: Attempt[];
  }
  ```

### Backup Export/Import Utility Schema
The Backup JSON format expects exactly the serialized `AppState` object.
During import in `src/store/context.tsx` (`importBackup`), the text is parsed and validated:
- It checks if `data` is an object.
- It validates the presence of key arrays: `Array.isArray(data.students)`, `Array.isArray(data.lessons)`, `Array.isArray(data.contracts)`, `Array.isArray(data.payments)`.
- If valid, it merges the data into the `defaultState`, overriding existing settings and AI data.
- It specifically retains the current AI keys (`state.ai.keys`) if the incoming backup does not contain any keys, ensuring keys aren't accidentally lost when importing a keyless backup.

## 3. Module-by-Module Feature Audit

### Home (`src/views/HomeView.tsx`)
- **Implemented:** Displays dashboard summary, upcoming classes, recent activity.
- **Mocked/Missing:** Mostly a summary view, relies on underlying data to be populated.

### Students (`src/views/StudentsView.tsx` & `src/views/StudentDetailView.tsx`)
- **Implemented:**
  - List of students with search and filtering (Active/Archived/All).
  - Displays summary of weekly schedule and balance status (Paid up/Owes/Advance).
  - `StudentDetailView` shows student info, active/ended contracts with progress bars for class/month cycles, recent classes, exam attempts, and payment history.
  - Ability to record payments, add/edit/end contracts, log lessons, and upload exam papers.
  - "WhatsApp" linking for student/guardian phone numbers is implemented via `waLink(phone)` (creates a `wa.me` URL).
- **Missing/Mocked:** No direct built-in SMS API integration; it relies on external WhatsApp links. No automated scheduled reminders.

### Classes (`src/views/ClassesView.tsx`)
- **Implemented:**
  - Log classes with duration, subject, topics, and homework.
  - Grouped by day. Filterable by student and month.
  - Stats for "Classes taught", "Hours", and "Absent / cancelled".
- **Missing:** Group classes / batches are not explicitly modeled; classes are 1:1 linked to a specific `Student`.

### Money (`src/views/MoneyView.tsx`)
- **Implemented:**
  - Monthly income/expense tracking, balance, net income, and outstanding dues.
  - "Export CSV" feature to download financial history.
  - Savings Goals integration (`GoalModal`, `GoalDepositModal`).
- **Missing/Mocked:** No automatic recurring expense tracking.

### AI (`src/views/AIView.tsx`)
- **Implemented:**
  - Generation of lesson plans, worksheets, and exam papers based on student grade/subject.
  - "Print" and "Print without answers" functions work by opening a print dialog on a rendered markdown view.
  - Saved AI documents (`SavedDoc`) list.
- **Missing/Mocked:** Printing uses the browser's native `window.print()` functionality, relying on CSS for print formatting rather than generating a PDF directly.

### Settings (`src/views/SettingsView.tsx`)
- **Implemented:**
  - Tutor profile (Name, Currency).
  - AI Configuration (Provider, Model selection, API Key input, Connection test).
  - Backup & Storage (Download Backup JSON, Restore from Backup, Erase All Data, Load Demo Sample Data).
  - Checkbox to include/exclude AI keys in the backup.
- **Missing/Mocked:** Mobile app wrapper settings (e.g. TWA configurations) are purely informational in the UI.

### AuthModal (`src/components/AuthModal.tsx`)
- **Implemented:**
  - Email/Password Login and Signup.
  - Google Sign-In using Firebase Auth (`signInWithPopup`).
  - Fallback offline warning UI when Firebase is not initialized.
- **Missing:** Password reset flow is not explicitly in the modal UI shown.

## 4. Authentication, Cloud Sync & Offline Fallback

### Firebase Auth & Firestore Sync
- **Auth:** Initialized in `src/services/firebase.ts`. Uses `getAuth`, `GoogleAuthProvider`.
- **Sync:** Authenticated user state is synced to Firestore (`users/{uid}/data/appState`) using real-time listeners (`onSnapshot`).
- **Offline Fallback:** The app primarily uses `localStorage` for the `AppState`. It works completely offline. If Firebase credentials are missing (`VITE_FIREBASE_API_KEY`, etc.), the app gracefully falls back to local-only mode.
- **Conflict Resolution:** Local data serves as a fallback. Upon the first login, if the remote Firestore profile is empty, local data is migrated to the cloud.

### Roles and Firestore Rules
- **Roles:** Defined in the User model and checked on the frontend (`isAdmin`, `isOwner`, `role`).
- **Enforcement:** `firestore.rules` enforces that users can only read/write their own data (`users/{userId}/...`).
- **Owner Bypass:** A helper function `isOwner()` checks if `request.auth.token.email.lower() == 'abdullahsazid109@gmail.com'`. The owner is granted full read/write access to all documents, bypassing standard client restrictions.
- **Billing Sync:** The Node server (`server/server.js`) mirrors billing state from SQLite to Firestore (`users/{userId}/data/billing`). The client reads this Firestore document to get the user's current entitlements.

## 5. AI Service & Privacy Architecture

### Architecture (`src/services/ai.ts`)
- **Providers:** Supports `gemini`, `groq`, `openrouter`, and local `ollama`.
- **Dynamic Discovery:** Models are fetched dynamically from the selected provider's API. A cache is used.
- **Prompts:** Extensive prompt engineering defined in `AI_SYSTEM`, `lessonPlanPrompt`, `examPrompt`, `worksheetPrompt`, `checkPrompt`, and `moneyPrompt`. They generate structured Markdown and JSON (for exams).
- **Privacy:** User-supplied AI API keys are stored strictly in local browser storage (`localStorage`) or within the synced AppState if explicitly requested. They are not transmitted to analytics.
- **BYOK vs Server Credits:** If a user uses the optional Node.js server, they can use the server's AI keys by consuming "credits". If they run as a static PWA or run out of credits on a free tier, they can input their own API key (Bring Your Own Key - BYOK) in the Settings view.

## 6. Backend & Monetization (`server/server.js`)

### Endpoints
- `GET /api/me`: Returns current user info and config.
- `POST /api/ai`: Proxy endpoint for generating AI content using server keys/credits.
- `POST /api/ads/start`, `POST /api/ads/claim`: endpoints for ad-rewarded credits.
- `POST /api/pay/start`: Initialize a payment.
- `GET /pay/test`, `POST /pay/test/finish`: Local test checkout flow.
- `POST /pay/sslcommerz/return`, `POST /pay/sslcommerz/ipn`: Webhooks for SSLCommerz payment gateway.
- `GET /api/admin/settings`, `PUT /api/admin/settings`: Admin config management.
- `POST /api/admin/ai-test`: Test AI connection.
- `GET /api/admin/users`, `POST /api/admin/user`: User and credit management.
- `GET /api/admin/payments`: View payments.
- `GET /api/admin/admins`, `POST /api/admin/admins`: Owner-only admin role assignment.

### Stack & Integrations
- **Storage:** Uses SQLite (`db.js`) as the primary database for users, payments, and credits. Syncs billing info back to Firestore.
- **Auth:** Uses Firebase Admin SDK (`admin.auth().verifyIdToken()`) to verify JWT tokens sent from the client.
- **Monetization:** SSLCommerz integration for BD local payments (bKash, Nagad, Cards). Allows purchasing "Pro" subscriptions or credits.
- **Production Needs:** Requires setting environment variables (`PORT`, `DATA_DIR`, `PUBLIC_URL`, `GEMINI_API_KEY`, etc.). Needs to be hosted on a Node.js compatible server (e.g., VPS, Heroku, Render) with a persistent volume for the SQLite database (`DATA_DIR`).

## 7. UX, Mobile Responsiveness, PWA & Commercial Readiness Gaps

### PWA Readiness
- **Configured:** Yes. It includes a `manifest.json`, an icon (`icons/icon.svg`), and a `service-worker.js`.
- **Installability:** In `src/main.tsx`, the service worker is registered. In `Navbar.tsx`, it prompts users to install the app ("📲 Install App").
- **Offline:** The service worker implements a network-first strategy, falling back to cache, enabling offline functionality.

### Gaps & Technical Debt
- **Frontend vs Backend Split:** The reliance on both Firestore (for data sync) and a custom Node.js server with SQLite (for billing and admin) creates architectural complexity and potential synchronization issues between the two data stores.
- **Group Classes / Batches:** The data model heavily links 1 contract/lesson to 1 student. Managing large batches of students (common in coaching centers) would require duplicating lessons/contracts across many students, which is a significant UX friction point.
- **Notifications/Reminders:** Completely missing internal SMS/Email automated reminders. It relies on manual WhatsApp clicks.
- **Reporting:** Basic CSV export exists, but no graphical charts or advanced analytics are built-in for revenue/attendance trends.
- **Test Coverage:** Exists (`src/tests/`), but scaling commercially requires ensuring comprehensive coverage, especially around state migrations and contract billing logic, which is complex.
