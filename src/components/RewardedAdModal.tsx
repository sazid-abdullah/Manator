import React, { useState, useEffect } from 'react';

interface RewardedAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRewardEarned: () => void;
}

export const RewardedAdModal: React.FC<RewardedAdModalProps> = ({ isOpen, onClose, onRewardEarned }) => {
  const [countdown, setCountdown] = useState(5);
  const [adFinished, setAdFinished] = useState(false);

  const adClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID;
  const adSlotId = import.meta.env.VITE_ADSENSE_REWARDED_SLOT_ID;
  const useLiveAds = adClientId && adSlotId;

  useEffect(() => {
    if (!isOpen) {
      setCountdown(5);
      setAdFinished(false);
      return;
    }

    if (useLiveAds) {
      try {
        const adsbygoogle = (window as any).adsbygoogle || [];
        adsbygoogle.push({});

        // Simulating the reward completion for real ads after 5 seconds
        // In a real Google AdSense rewarded ad, you'd use their specific callback logic,
        // but since we are just wrapping it, we fallback to a timer-based reward logic
        // to mimic the behavior for the user.
        const timer = setTimeout(() => {
          setAdFinished(true);
        }, 5000);
        return () => clearTimeout(timer);
      } catch (e) {
        console.error('AdSense error', e);
      }
    } else {
      // Fallback House Ad Mode
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setAdFinished(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isOpen, useLiveAds]);

  const handleClaim = () => {
    onRewardEarned();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop"></div>
      <div className="modal" style={{ maxWidth: '480px', textAlign: 'center' }}>
        <div className="modal-head">
          <h2>Earn 1 Free AI Request</h2>
          {adFinished && <button className="icon-btn" onClick={onClose}>×</button>}
        </div>
        <div className="modal-body">
          {useLiveAds ? (
            <div className="ad-player" style={{ minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ins
                className="adsbygoogle"
                style={{ display: 'block', width: '100%', height: '100%' }}
                data-ad-client={adClientId}
                data-ad-slot={adSlotId}
                data-ad-format="auto"
                data-full-width-responsive="true"
              ></ins>
            </div>
          ) : (
            <div className="ad-player">
              <div className="ad-creative">
                <span className="ad-tag">AD</span>
                <div>
                  <div className="ad-big">Tuitrix Pro</div>
                  <p>Unlimited AI exams, branded PDF exports, and deep analytics.</p>
                </div>
              </div>
            </div>
          )}

          {!adFinished ? (
            <div style={{ marginTop: '20px' }}>
              <p className="muted">Please wait...</p>
              <div className="progress" style={{ width: '100%', maxWidth: '200px', margin: '10px auto' }}>
                 <span style={{ width: `${useLiveAds ? 100 : ((5 - countdown) / 5) * 100}%`, transition: 'width 1s linear' }}></span>
              </div>
              {!useLiveAds && <p className="small muted">Reward in {countdown}s</p>}
            </div>
          ) : (
            <div style={{ marginTop: '20px' }}>
              <p style={{ color: 'var(--green)', fontWeight: 600, marginBottom: '12px' }}>✅ Reward unlocked!</p>
              <button className="btn primary" onClick={handleClaim} style={{ width: '100%', padding: '12px' }}>
                Claim +1 AI Request
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
