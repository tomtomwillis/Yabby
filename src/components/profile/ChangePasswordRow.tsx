import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, describeAuthError } from '../../api/auth';
import { clearLocalSignIn, localSessionEnded } from '../../utils/localSession';
import './AccountAuthRows.css';

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

/** The password row for a member signed in through /signin: changed here, not by email. */
const ChangePasswordRow: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) currentRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setAgain('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!current) {
      setError('enter your current password.');
      return;
    }
    if (next.length < MIN_PASSWORD || next.length > MAX_PASSWORD) {
      setError(`new passwords are ${MIN_PASSWORD}–${MAX_PASSWORD} characters.`);
      return;
    }
    if (next !== again) {
      setError('the two new passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await changePassword(current, next);
      close();
      // Every session, this one included, is gone on the server. The sign-in
      // page signs Firebase out once it has taken over from the private route.
      clearLocalSignIn();
      navigate('/signin', { replace: true, state: { notice: 'password_changed' } });
    } catch (err) {
      const { code, text } = describeAuthError(err);
      setError(text);
      setCurrent('');
      if (code === 'no_session') void localSessionEnded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <li className="me-row">
        <span className="me-row-key">password</span>
        <span className="me-row-leader" aria-hidden="true"></span>
        <span className="me-row-val">
          <button
            type="button"
            className="me-act"
            onClick={() => (open ? close() : setOpen(true))}
            aria-expanded={open}
            aria-controls="aa-password"
          >
            {open ? 'cancel' : 'change password'}
          </button>
        </span>
      </li>

      {open && (
        <li className="aa-panel" id="aa-password">
          <form onSubmit={handleSubmit} noValidate>
            <label className="aa-field">
              <span className="me-label">current password</span>
              <input
                ref={currentRef}
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
                maxLength={MAX_PASSWORD}
                className="aa-input"
              />
            </label>
            <label className="aa-field">
              <span className="me-label">new password</span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                maxLength={MAX_PASSWORD}
                aria-describedby="aa-password-hint"
                className="aa-input"
              />
              <span id="aa-password-hint" className="aa-hint">at least {MIN_PASSWORD} characters, not a common one. every device is signed out after.</span>
            </label>
            <label className="aa-field">
              <span className="me-label">new password again</span>
              <input
                type="password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
                maxLength={MAX_PASSWORD}
                className="aa-input"
              />
            </label>
            <div aria-live="assertive">
              {error && <p className="me-msg me-msg--in-band me-msg--bad">{error}</p>}
            </div>
            <div className="aa-actions">
              <button type="submit" className="me-act" disabled={busy}>
                {busy ? 'saving…' : 'change password'}
              </button>
            </div>
          </form>
        </li>
      )}
    </>
  );
};

export default ChangePasswordRow;
