import React, { useState, useEffect } from 'react';
import { PricingConfig } from '../types';
import { fetchPricingConfig } from '../services/firebase';
import { ApkShareModal } from '../components/ApkShareModal';

interface LandingViewProps {
  onEnterApp: () => void;
  onSignIn: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onEnterApp, onSignIn }) => {
  const [lang, setLang] = useState<'EN' | 'BN'>('EN');
  const [activeTab, setActiveTab] = useState(1);
  const [cycleClicks, setCycleClicks] = useState(11);
  const [showEnReport, setShowEnReport] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [apkModalOpen, setApkModalOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('tuitrix_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('tuitrix_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    if (newTheme === 'light') {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    }
  };

  useEffect(() => {
    fetchPricingConfig().then(config => setPricingConfig(config)).catch(() => {});
  }, []);

  const monthlyPriceStr = pricingConfig ? `৳${pricingConfig.monthlyPrice}` : '৳199';


  return (
    <div className="landing-container">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-logo">
          <svg width="28" height="28" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bg_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#161922"/>
                <stop offset="100%" stopColor="#0b0d14"/>
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="128" fill="url(#bg_nav)"/>
            <path d="M160 120 L352 120 L256 400 Z" fill="#5b8cff"/>
            <path d="M160 120 L352 120 L256 260 Z" fill="#3ecf8e" opacity="0.9"/>
          </svg>
          <span className="brand-name">Tuitrix</span>
        </div>
        <div className="landing-nav">
          <button className="lang-toggle" onClick={toggleTheme} title="Toggle Theme" style={{ padding: '6px' }}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <button className="lang-toggle" onClick={() => setLang(lang === 'EN' ? 'BN' : 'EN')}>
            {lang === 'EN' ? 'বাংলা' : 'English'}
          </button>
          <button className="nav-signin" onClick={onSignIn}>Sign In</button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1>
            {lang === 'EN'
              ? 'The #1 Smart Tuition, Batch & AI Exam Manager for Tutors in Bangladesh'
              : 'বাংলাদেশের টিউটর ও কোচিং শিক্ষকদের জন্য ১ নম্বর স্মার্ট টিউশন ও ব্যাচ ম্যানেজার'}
          </h1>
          <p className="hero-sub">
            {lang === 'EN'
              ? 'Track 12-class or monthly tuition cycles, log batch attendance in 1 tap, send verified Bangla/English WhatsApp parent reports, and generate print-ready PDF exam sheets with AI.'
              : '১২-ক্লাস বা মাসিক টিউশন সাইকেল ট্র্যাক করুন, ১ ক্লিকে ব্যাচ হাজিরা নিন, হোয়াটসঅ্যাপে রেজাল্ট পাঠান এবং এআই দিয়ে পরীক্ষার প্রশ্ন তৈরি করুন।'}
          </p>
          <div className="hero-ctas">
            <button className="cta-primary" onClick={onEnterApp}>
              🚀 {lang === 'EN' ? 'Start Free — No Card Needed' : 'ফ্রি শুরু করুন — কোনো কার্ড লাগবে না'}
            </button>
            <button className="cta-secondary" onClick={onSignIn}>
              🔑 {lang === 'EN' ? 'Sign In / Create Cloud Account' : 'লগইন / নতুন একাউন্ট'}
            </button>
          </div>
          <div style={{ marginTop: '20px' }}>
            <button className="btn outline" onClick={() => setApkModalOpen(true)} style={{ background: 'var(--surface)', borderColor: 'var(--green)', color: 'var(--green)' }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" style={{ marginRight: '6px' }}>
                <path d="M17.5 14.5L12 20l-5.5-5.5.9-.9 3.6 3.6V3h2v14.2l3.6-3.6.9.9z" />
              </svg>
              📱 {lang === 'EN' ? 'Get Android APK / Scan QR' : 'অ্যান্ড্রয়েড অ্যাপ / কিউআর কোড'}
            </button>
          </div>
        </div>
      </section>

      {/* Interactive Feature Showcase */}
      <section className="showcase">
        <h2>{lang === 'EN' ? 'See It In Action' : 'কার্যকারিতা দেখুন'}</h2>
        <div className="showcase-widget">
          <div className="showcase-tabs">
            <button className={activeTab === 1 ? 'active' : ''} onClick={() => setActiveTab(1)}>
              1. Cycle & Batch
            </button>
            <button className={activeTab === 2 ? 'active' : ''} onClick={() => setActiveTab(2)}>
              2. WhatsApp Reports
            </button>
            <button className={activeTab === 3 ? 'active' : ''} onClick={() => setActiveTab(3)}>
              3. AI PDF Exams
            </button>
            <button className={activeTab === 4 ? 'active' : ''} onClick={() => setActiveTab(4)}>
              4. ৳ Analytics
            </button>
          </div>
          <div className="showcase-content">
            {activeTab === 1 && (
              <div className="tab-pane cycle-demo">
                <h3>{lang === 'EN' ? 'Tap to log next class' : 'পরবর্তী ক্লাস যোগ করতে ট্যাপ করুন'}</h3>
                <div className="cycle-bar-container">
                  <div className="cycle-bar">
                    <div className="cycle-fill" style={{ width: `${(cycleClicks / 12) * 100}%` }}></div>
                  </div>
                  <div className="cycle-text">{cycleClicks}/12 Classes</div>
                </div>
                <button
                  className="demo-btn"
                  onClick={() => {
                    if (cycleClicks < 12) setCycleClicks(c => c + 1);
                    else setCycleClicks(1);
                  }}
                >
                  Log Class
                </button>
                {cycleClicks === 12 && (
                  <div className="cycle-alert">
                    Cycle Complete — Fee Due: ৳5,000
                  </div>
                )}
              </div>
            )}

            {activeTab === 2 && (
              <div className="tab-pane whatsapp-demo">
                <div className="wa-toggle">
                  <button className={!showEnReport ? 'active' : ''} onClick={() => setShowEnReport(false)}>BN</button>
                  <button className={showEnReport ? 'active' : ''} onClick={() => setShowEnReport(true)}>EN</button>
                </div>
                <div className="wa-bubble">
                  {showEnReport ? (
                    <pre>
                      [Tuitrix Update]
                      Student: Rahim
                      Physics Exam: 85%
                      Attendance: Present
                    </pre>
                  ) : (
                    <pre>
                      [টুইট্রিক্স আপডেট]
                      শিক্ষার্থী: রহিম
                      পদার্থবিজ্ঞান পরীক্ষা: ৮৫%
                      উপস্থিতি: উপস্থিত
                    </pre>
                  )}
                </div>
              </div>
            )}

            {activeTab === 3 && (
              <div className="tab-pane ai-demo">
                <div className="ai-pdf-preview">
                  <div className="pdf-header">
                    <h2>Physics Chapter 4 CQ</h2>
                    <p>Tutor: Prof. Abdullah</p>
                  </div>
                  <div className="pdf-body">
                    <p>1. What is Newton's second law?</p>
                    <div className="ai-watermark">Generated by Tuitrix AI</div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 4 && (
              <div className="tab-pane analytics-demo">
                <div className="chart-preview">
                  <div className="bar b1" style={{height: '40%'}}><span className="tooltip">৳ 12,000</span></div>
                  <div className="bar b2" style={{height: '60%'}}><span className="tooltip">৳ 18,000</span></div>
                  <div className="bar b3" style={{height: '50%'}}><span className="tooltip">৳ 15,000</span></div>
                  <div className="bar b4" style={{height: '80%'}}><span className="tooltip">৳ 24,000</span></div>
                  <div className="bar b5" style={{height: '70%'}}><span className="tooltip">৳ 21,000</span></div>
                  <div className="bar b6" style={{height: '90%'}}><span className="tooltip">৳ 27,000</span></div>
                </div>
                <p className="chart-label">6-Month Income Trend</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="pricing-section">
        <h2>{lang === 'EN' ? 'Transparent Pricing' : 'স্বচ্ছ প্রাইসিং'}</h2>
        <div className="pricing-table">
          <div className="pricing-card free">
            <h3>Free Forever</h3>
            <div className="price">৳0 <span>/ month</span></div>
            <ul>
              <li>Up to 15 Students & 2 Batches</li>
              <li>5 AI Exam/Note Requests per day</li>
              <li>5 Saved AI Library Resources</li>
              <li>Bilingual WhatsApp Reminders</li>
              <li>Cloud Sync across devices</li>
            </ul>
            <button className="cta-outline" onClick={onEnterApp}>
              {lang === 'EN' ? 'Start Free' : 'ফ্রি শুরু করুন'}
            </button>
          </div>

          <div className="pricing-card pro">
            <div className="pro-badge">👑 PRO</div>
            <h3>Tuitrix Pro</h3>
            <div className="price">{monthlyPriceStr} <span>/ month</span></div>
            <ul>
              <li>Unlimited Students & Batches</li>
              <li>Unlimited, Ad-Free AI Generation</li>
              <li>Unlimited Saved AI Library</li>
              <li>Live Parent Portal Links</li>
              <li>Custom Branded PDF Exams</li>
              <li>Full 6-Month ৳ Analytics</li>
            </ul>
            <div className="payment-methods">
              <span className="bkash-badge">bKash</span>
              <span className="nagad-badge">Nagad</span>
              <span className="rocket-badge">Rocket</span>
            </div>
            <button className="cta-primary" onClick={onSignIn}>
              {lang === 'EN' ? 'Get Pro via TrxID' : 'প্রো কিনুন'}
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials">
        <h2>{lang === 'EN' ? 'Loved by Tutors in BD' : 'টিউটরদের আস্থার প্রতীক'}</h2>
        <div className="testimonial-grid">
          <div className="testimonial-card">
            <p>"No more manual cycle counting! Tuitrix notifies me when the 12th class is done."</p>
            <div className="author">- Hassan, HSC Physics Tutor</div>
          </div>
          <div className="testimonial-card">
            <p>"The AI generated PDFs look so professional with my branding. Parents love it!"</p>
            <div className="author">- Sarah, O-Level Math</div>
          </div>
          <div className="testimonial-card">
            <p>"Sending WhatsApp results in Bangla makes communication with parents so easy."</p>
            <div className="author">- Rafiq, SSC Batch Instructor</div>
          </div>
        </div>
      </section>

      {/* FAQ & Footer */}
      <section className="faq-section">
        <h2>FAQ</h2>
        <div className="faq-item">
          <h4>How does the 12-class cycle tracking work?</h4>
          <p>Tuitrix automatically increments the class count each time you log a lesson and alerts you when payment is due.</p>
        </div>
        <div className="faq-item">
          <h4>How do I upgrade via bKash/Nagad?</h4>
          <p>Simply send money to the listed number in Settings and submit your TrxID. Instant activation!</p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">Tuitrix &copy; {new Date().getFullYear()}</div>
          <div className="footer-links">
            <button onClick={onEnterApp}>Launch App</button>
            <button onClick={onSignIn}>Sign In</button>
          </div>
        </div>
      </footer>

      <ApkShareModal isOpen={apkModalOpen} onClose={() => setApkModalOpen(false)} />
    </div>
  );
};
