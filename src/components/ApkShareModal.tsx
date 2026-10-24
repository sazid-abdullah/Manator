import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ApkShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkShareModal: React.FC<ApkShareModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!isOpen) return null;

  const apkUrl = import.meta.env.VITE_ANDROID_APK_URL || '/tuitrix-latest.apk';
  const appUrl = window.location.origin;

  const handleDownload = async () => {
    // If we have an APK url specified and it is an actual URL, navigate to it
    if (import.meta.env.VITE_ANDROID_APK_URL) {
      window.location.href = import.meta.env.VITE_ANDROID_APK_URL;
    } else if (deferredPrompt) {
      // Trigger PWA install
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // Show fallback alert
      alert("To install on Android: Tap the Browser Menu (⋮) and select 'Install App' or 'Add to Home Screen'.");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(appUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareText = encodeURIComponent(`Manage your tuition batches, track payments & generate AI exams with Tuitrix! ${appUrl}`);
  const whatsappUrl = `https://wa.me/?text=${shareText}`;

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}></div>
      <div className="modal" style={{ maxWidth: '420px', textAlign: 'center', paddingBottom: '24px' }}>
        <div className="modal-head">
          <h2 style={{ fontSize: '1.25rem' }}>Android App & Share</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close modal">×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>

          <button className="btn primary" style={{ width: '100%', padding: '14px', fontSize: '1.05rem' }} onClick={handleDownload}>
            📥 Download Android APK
          </button>

          <div style={{ padding: '16px', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', width: '100%' }}>
             <p className="muted small" style={{ marginBottom: '12px' }}>Scan to open Tuitrix instantly:</p>
             <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', display: 'inline-block' }}>
               <QRCodeSVG value={appUrl} size={180} level="M" />
             </div>
             <p style={{ marginTop: '12px', fontSize: '0.9rem', fontWeight: 600 }}>{appUrl}</p>
          </div>

          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
             <button className="btn outline" style={{ flex: 1 }} onClick={handleCopy}>
               {copied ? '✅ Copied!' : '📋 Copy Link'}
             </button>
             <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn green" style={{ flex: 1, textAlign: 'center' }}>
               💬 WhatsApp
             </a>
          </div>

        </div>
      </div>
    </>
  );
};
