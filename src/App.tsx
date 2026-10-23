import React, { useState, useEffect } from 'react';
import { useStore } from './store/context';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/ToastContainer';
import { StudentModal } from './components/StudentModal';
import { ContractModal } from './components/ContractModal';
import { LessonModal } from './components/LessonModal';
import { PaymentModal } from './components/PaymentModal';
import { ExpenseModal } from './components/ExpenseModal';
import { GoalModal } from './components/GoalModal';
import { GoalDepositModal } from './components/GoalDepositModal';
import { UploadPaperModal } from './components/UploadPaperModal';
import { ImportDocModal } from './components/ImportDocModal';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { auth } from './services/firebase';

import { HomeView } from './views/HomeView';
import { StudentsView } from './views/StudentsView';
import { StudentDetailView } from './views/StudentDetailView';
import { ClassesView } from './views/ClassesView';
import { MoneyView } from './views/MoneyView';
import { AIView } from './views/AIView';
import { ExamView } from './views/ExamView';
import { ResultView } from './views/ResultView';
import { SettingsView } from './views/SettingsView';

import { Student, Contract, Lesson, Payment, Expense, Goal, SavedDoc } from './types';
import { fmtClock } from './utils/date';

export const App: React.FC = () => {
  const { state, isStateLoaded } = useStore();

  // Route state parsed from location.hash
  const [route, setRoute] = useState<string>('home');
  const [routeParam, setRouteParam] = useState<string>('');

  const parseHash = () => {
    const h = window.location.hash.replace(/^#\/?/, '') || 'home';
    const [path, queryString] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const r = parts[0] || 'home';
    const param = parts[1] || (queryString ? `?${queryString}` : '');
    setRoute(r);
    setRouteParam(param);
  };

  useEffect(() => {
    parseHash();
    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, []);

  const navigate = (newRoute: string, param?: string) => {
    const hash = param ? `#/${newRoute}/${param}` : `#/${newRoute}`;
    window.location.hash = hash;
  };

  // Modal states
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [contractStudentId, setContractStudentId] = useState('');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [fromNewStudent, setFromNewStudent] = useState(false);

  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [lessonOpts, setLessonOpts] = useState<{
    studentId?: string;
    time?: string;
    duration?: number;
    status?: any;
  }>({});

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [paymentOpts, setPaymentOpts] = useState<{
    studentId?: string;
    contractId?: string;
  }>({});

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositGoalId, setDepositGoalId] = useState('');

  const [uploadPaperModalOpen, setUploadPaperModalOpen] = useState(false);
  const [uploadStudentId, setUploadStudentId] = useState('');

  const [importDocModalOpen, setImportDocModalOpen] = useState(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    if (auth) {
      unsubscribe = auth.onAuthStateChanged((user) => {
        setIsAuthenticated(!!user);
      });
    }
    return () => unsubscribe();
  }, []);

  const requiresOnboarding = isStateLoaded && isAuthenticated && (!state.profile || !state.profile.brandTitle);

  // Check for running exams
  const runningExam = state.attempts.find(
    a => a.status === 'running' && a.endsAt > Date.now()
  );

  if (requiresOnboarding) {
    return (
      <>
        <Navbar currentRoute={route} onNavigate={navigate} onLoginClick={() => setAuthModalOpen(true)} />
        <main id="view" tabIndex={-1}></main>
        <OnboardingModal isOpen={true} />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <Navbar currentRoute={route} onNavigate={navigate} onLoginClick={() => setAuthModalOpen(true)} />

      <main id="view" tabIndex={-1}>
        {runningExam && route !== 'exam' && (
          <div className="notice warn" style={{ marginBottom: '16px' }}>
            An exam is currently in progress: <b>{runningExam.title}</b> (
            {fmtClock(runningExam.endsAt - Date.now())} remaining).{' '}
            <a
              href={`#/exam/${runningExam.id}`}
              onClick={e => {
                e.preventDefault();
                navigate('exam', runningExam.id);
              }}
            >
              Go back to the exam
            </a>
          </div>
        )}

        {route === 'home' && (
          <HomeView
            onNavigate={navigate}
            onOpenLessonModal={opts => {
              setSelectedLesson(opts.lesson || null);
              setLessonOpts(opts);
              setLessonModalOpen(true);
            }}
            onOpenPaymentModal={opts => {
              setSelectedPayment(null);
              setPaymentOpts(opts);
              setPaymentModalOpen(true);
            }}
            onOpenStudentModal={() => {
              setSelectedStudent(null);
              setStudentModalOpen(true);
            }}
          />
        )}

        {route === 'students' && (
          <StudentsView
            onNavigate={navigate}
            onOpenStudentModal={() => {
              setSelectedStudent(null);
              setStudentModalOpen(true);
            }}
          />
        )}

        {route === 'student' && (
          <StudentDetailView
            studentId={routeParam}
            onNavigate={navigate}
            onEditStudent={s => {
              setSelectedStudent(s);
              setStudentModalOpen(true);
            }}
            onAddContract={sid => {
              setContractStudentId(sid);
              setSelectedContract(null);
              setFromNewStudent(false);
              setContractModalOpen(true);
            }}
            onEditContract={c => {
              setContractStudentId(c.studentId);
              setSelectedContract(c);
              setFromNewStudent(false);
              setContractModalOpen(true);
            }}
            onLogLesson={opts => {
              setSelectedLesson(opts.lesson || null);
              setLessonOpts({ studentId: opts.studentId });
              setLessonModalOpen(true);
            }}
            onRecordPayment={opts => {
              setSelectedPayment(opts.payment || null);
              setPaymentOpts(opts);
              setPaymentModalOpen(true);
            }}
            onUploadPaper={sid => {
              setUploadStudentId(sid);
              setUploadPaperModalOpen(true);
            }}
          />
        )}

        {route === 'classes' && (
          <ClassesView
            initialStudentFilter={routeParam.startsWith('student=') ? routeParam.split('=')[1] : ''}
            onNavigate={navigate}
            onLogLesson={opts => {
              setSelectedLesson(opts.lesson || null);
              setLessonOpts(opts);
              setLessonModalOpen(true);
            }}
          />
        )}

        {route === 'money' && (
          <MoneyView
            onNavigate={navigate}
            onRecordPayment={opts => {
              setSelectedPayment(opts?.payment || null);
              setPaymentOpts(opts || {});
              setPaymentModalOpen(true);
            }}
            onAddExpense={exp => {
              setSelectedExpense(exp || null);
              setExpenseModalOpen(true);
            }}
            onAddGoal={g => {
              setSelectedGoal(g || null);
              setGoalModalOpen(true);
            }}
            onDepositGoal={gid => {
              setDepositGoalId(gid);
              setDepositModalOpen(true);
            }}
          />
        )}

        {route === 'ai' && (
          <AIView
            onNavigate={navigate}
            onStartExam={(doc: SavedDoc) => {
              // Start exam attempt
              const now = Date.now();
              const existingExam = state.exams.find(e => e.docId === doc.id);
              const examId = existingExam?.id || doc.id;
              const duration = existingExam?.duration || 60;

              const attemptId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
              const newAttempt = {
                id: attemptId,
                examId,
                title: doc.title,
                studentId: doc.studentId || null,
                startedAt: now,
                endsAt: now + duration * 60000,
                submittedAt: null,
                auto: false,
                status: 'running' as const,
                answers: {},
                marks: {},
                aiMarks: {},
              };

              state.attempts.push(newAttempt);
              navigate('exam', attemptId);
            }}
            onUploadPaper={() => {
              setUploadStudentId('');
              setUploadPaperModalOpen(true);
            }}
            onImportDoc={() => setImportDocModalOpen(true)}
          />
        )}

        {route === 'exam' && (
          <ExamView attemptId={routeParam} onNavigate={navigate} />
        )}

        {route === 'result' && (
          <ResultView attemptId={routeParam} onNavigate={navigate} />
        )}

        {route === 'settings' && <SettingsView />}
      </main>

      {/* Global Modals */}
      <StudentModal
        isOpen={studentModalOpen}
        student={selectedStudent}
        onClose={() => setStudentModalOpen(false)}
        onStudentSaved={(id, isNew) => {
          if (isNew) {
            navigate('student', id);
            setContractStudentId(id);
            setSelectedContract(null);
            setFromNewStudent(true);
            setContractModalOpen(true);
          }
        }}
      />

      <ContractModal
        isOpen={contractModalOpen}
        studentId={contractStudentId}
        contract={selectedContract}
        fromNewStudent={fromNewStudent}
        onClose={() => setContractModalOpen(false)}
      />

      <LessonModal
        isOpen={lessonModalOpen}
        lesson={selectedLesson}
        initialStudentId={lessonOpts.studentId}
        initialTime={lessonOpts.time}
        initialDuration={lessonOpts.duration}
        initialStatus={lessonOpts.status}
        onClose={() => setLessonModalOpen(false)}
      />

      <PaymentModal
        isOpen={paymentModalOpen}
        payment={selectedPayment}
        initialStudentId={paymentOpts.studentId}
        initialContractId={paymentOpts.contractId}
        onClose={() => setPaymentModalOpen(false)}
      />

      <ExpenseModal
        isOpen={expenseModalOpen}
        expense={selectedExpense}
        onClose={() => setExpenseModalOpen(false)}
      />

      <GoalModal
        isOpen={goalModalOpen}
        goal={selectedGoal}
        onClose={() => setGoalModalOpen(false)}
      />

      <GoalDepositModal
        isOpen={depositModalOpen}
        goalId={depositGoalId}
        onClose={() => setDepositModalOpen(false)}
      />

      <UploadPaperModal
        isOpen={uploadPaperModalOpen}
        initialStudentId={uploadStudentId}
        onClose={() => setUploadPaperModalOpen(false)}
        onExamReady={(docId, examId) => {
          navigate('ai', `tool=saved&doc=${docId}`);
        }}
      />

      <ImportDocModal
        isOpen={importDocModalOpen}
        onClose={() => setImportDocModalOpen(false)}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />

      <ToastContainer />
    </>
  );
};
