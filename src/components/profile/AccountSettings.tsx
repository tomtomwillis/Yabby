import React, { useState } from 'react';
import { getAuth, sendPasswordResetEmail, signOut, type User } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { updateDocShadowed } from '../../api/shadow';
import { db } from '../../firebaseConfig';
import { clearUserCache } from '../../utils/userCache';
import MusicAccount from '../MusicAccount';
import YeishinTokens from '../YeishinTokens';

interface AccountSettingsProps {
  user: User | null;
  isAdmin: boolean;
  /** Held by the page, since they arrive with the profile document. */
  nekoEnabled: boolean;
  setNekoEnabled: (value: boolean) => void;
  designToolEnabled: boolean;
  setDesignToolEnabled: (value: boolean) => void;
}

/** The account itself: password reset, the site toggles, and logging out. */
const AccountSettings: React.FC<AccountSettingsProps> = ({
  user,
  isAdmin,
  nekoEnabled,
  setNekoEnabled,
  designToolEnabled,
  setDesignToolEnabled,
}) => {
  const auth = getAuth();
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  const handlePasswordReset = async () => {
    if (!user || !user.email) {
      setPasswordResetMessage('No email found for current user.');
      setPasswordResetSuccess(false);
      return;
    }

    setPasswordResetLoading(true);
    setPasswordResetMessage('');

    try {
      await sendPasswordResetEmail(auth, user.email);
      setPasswordResetMessage(`Password reset email sent to ${user.email}`);
      setPasswordResetSuccess(true);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      setPasswordResetMessage('Failed to send password reset email. Please try again.');
      setPasswordResetSuccess(false);
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleNekoToggle = async () => {
    if (!user) return;
    const newValue = !nekoEnabled;
    setNekoEnabled(newValue);
    localStorage.setItem('nekoEnabled', String(newValue));
    window.dispatchEvent(new CustomEvent('oneko-toggle', { detail: newValue }));

    try {
      await updateDocShadowed(doc(db, 'users', user.uid), { nekoEnabled: newValue });
      clearUserCache(user.uid);
    } catch {
      // Revert on failure
      setNekoEnabled(!newValue);
      localStorage.setItem('nekoEnabled', String(!newValue));
      window.dispatchEvent(new CustomEvent('oneko-toggle', { detail: !newValue }));
    }
  };

  const handleDesignToolToggle = async () => {
    if (!user) return;
    const newValue = !designToolEnabled;
    setDesignToolEnabled(newValue);
    localStorage.setItem('designToolEnabled', String(newValue));
    window.dispatchEvent(new CustomEvent('design-tool-toggle', { detail: newValue }));

    try {
      await updateDocShadowed(doc(db, 'users', user.uid), { designToolEnabled: newValue });
      clearUserCache(user.uid);
    } catch {
      setDesignToolEnabled(!newValue);
      localStorage.setItem('designToolEnabled', String(!newValue));
      window.dispatchEvent(new CustomEvent('design-tool-toggle', { detail: !newValue }));
    }
  };

  return (
    <>
      {/* ── The account itself ── */}
      <h2 className="me-h">
        <span className="me-h-label">account</span>
        <span className="me-h-rule" aria-hidden="true"></span>
        {user?.email && <span className="me-h-note">{user.email}</span>}
      </h2>

      <ul className="me-rows">
        <li className="me-row">
          <span className="me-row-key">password</span>
          <span className="me-row-leader" aria-hidden="true"></span>
          <span className="me-row-val">
            <button
              type="button"
              className="me-act"
              onClick={handlePasswordReset}
              disabled={passwordResetLoading || passwordResetSuccess}
            >
              {passwordResetLoading ? 'sending…' : passwordResetSuccess ? 'sent' : 'send reset email'}
            </button>
          </span>
        </li>

        {/* The cat follows a pointer, so there is nothing for it to follow on a
            touch screen — the setting is not offered where it cannot apply. */}
        {!window.matchMedia('(pointer: coarse)').matches && (
          <li className="me-row">
            <span className="me-row-key">oneko</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">
              <label className="me-check">
                <input type="checkbox" checked={nekoEnabled} onChange={handleNekoToggle} />
                <span className="me-check-mark" aria-hidden="true">
                  {nekoEnabled ? '[x] on' : '[ ] off'}
                </span>
              </label>
            </span>
          </li>
        )}

        {isAdmin && (
          <li className="me-row">
            <span className="me-row-key">design tool</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">
              <label className="me-check">
                <input
                  type="checkbox"
                  checked={designToolEnabled}
                  onChange={handleDesignToolToggle}
                />
                <span className="me-check-mark" aria-hidden="true">
                  {designToolEnabled ? '[x] on' : '[ ] off'}
                </span>
              </label>
            </span>
          </li>
        )}

        {/* The server decides whether this is offered, not the admin flag. */}
        <MusicAccount />

        {isAdmin && <YeishinTokens />}

        <li className="me-row">
          <span className="me-row-key">session</span>
          <span className="me-row-leader" aria-hidden="true"></span>
          <span className="me-row-val">
            <button type="button" className="me-act me-act--del" onClick={handleLogout}>
              log out
            </button>
          </span>
        </li>
      </ul>

      {passwordResetMessage && (
        <p
          className={`me-msg ${passwordResetSuccess ? 'me-msg--good' : 'me-msg--bad'}`}
          role="status"
        >
          {passwordResetMessage}
        </p>
      )}
    </>
  );
};

export default AccountSettings;
