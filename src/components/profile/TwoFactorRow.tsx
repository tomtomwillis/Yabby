import React, { useEffect, useRef, useState } from 'react';
import { describeAuthError, disableTwoFactor, type LocalSession } from '../../api/auth';
import { localSessionEnded, refreshLocalSession } from '../../utils/localSession';
import TwoFactorEnrol from '../auth/TwoFactorEnrol';
import './AccountAuthRows.css';

interface TwoFactorRowProps {
  session: LocalSession;
}

/** Two-step sign-in on or off, for a member signed in through /signin. */
const TwoFactorRow: React.FC<TwoFactorRowProps> = ({ session }) => {
  const [mode, setMode] = useState<'idle' | 'enrol' | 'disable'>('idle');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'disable') passwordRef.current?.focus();
  }, [mode]);

  const close = () => {
    setMode('idle');
    setPassword('');
    setError('');
  };

  const open = (next: 'enrol' | 'disable') => {
    setMessage('');
    setError('');
    setMode(next);
  };

  const handleDisable = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) {
      setError('enter your password first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await disableTwoFactor(password);
      close();
      setMessage('two-step sign-in is off.');
      await refreshLocalSession();
    } catch (err) {
      const { code, text } = describeAuthError(err);
      setError(text);
      setPassword('');
      if (code === 'no_session') void localSessionEnded();
    } finally {
      setBusy(false);
    }
  };

  const on = session.twoFactorEnabled;

  return (
    <>
      <li className="me-row">
        <span className="me-row-key">two-step sign-in</span>
        <span className="me-row-leader" aria-hidden="true"></span>
        <span className="me-row-val">
          <span className={`aa-state${on ? '' : ' aa-state--off'}`}>
            {on ? (session.twoFactorRequired ? 'on · required' : 'on') : 'off'}
          </span>
          {mode !== 'idle' ? (
            <button type="button" className="me-act" onClick={close} disabled={busy}>
              cancel
            </button>
          ) : !on ? (
            <button type="button" className="me-act" onClick={() => open('enrol')}>
              turn on
            </button>
          ) : !session.twoFactorRequired ? (
            <button type="button" className="me-act me-act--del" onClick={() => open('disable')}>
              turn off
            </button>
          ) : null}
        </span>
      </li>

      {mode === 'enrol' && (
        <li className="aa-panel">
          <TwoFactorEnrol
            look="row"
            onConfirmed={async () => {
              // The returned token is for a sign-in this browser already has.
              close();
              setMessage('two-step sign-in is on.');
              await refreshLocalSession();
            }}
            onSessionEnded={() => void localSessionEnded()}
          />
        </li>
      )}

      {mode === 'disable' && (
        <li className="aa-panel">
          <form onSubmit={handleDisable} noValidate>
            <h3 className="aa-h">turn off two-step sign-in</h3>
            <label className="aa-field">
              <span className="me-label">password</span>
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
                maxLength={128}
                className="aa-input"
              />
            </label>
            <div aria-live="assertive">
              {error && <p className="me-msg me-msg--in-band me-msg--bad">{error}</p>}
            </div>
            <div className="aa-actions">
              <button type="submit" className="me-act me-act--del" disabled={busy}>
                {busy ? 'checking…' : 'turn it off'}
              </button>
            </div>
          </form>
        </li>
      )}

      {message && (
        <li className="me-row">
          <span className="me-msg me-msg--good aa-done" role="status">{message}</span>
        </li>
      )}
    </>
  );
};

export default TwoFactorRow;
