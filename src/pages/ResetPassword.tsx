import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeAuthError, resetPassword } from '../api/auth';
import { tokenFromHash } from '../utils/authFlow';
import BackgroundStar from '../components/basic/Star';
import AsciiTitle from '../components/basic/AsciiTitle';
import Button from '../components/basic/Button';
import './Login.css';
import './SignIn.css';

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

/** Where an admin's reset link lands: `/reset-password#token=…`. */
const ResetPassword = () => {
  // Read once; the fragment never reaches a server, and is taken off the
  // address bar below so it stays out of history and screenshots.
  const [token] = useState(() => tokenFromHash(window.location.hash));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [dead, setDead] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      setError(`passwords are ${MIN_PASSWORD}–${MAX_PASSWORD} characters.`);
      firstFieldRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setError('the two passwords do not match.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await resetPassword(token, password);
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      const { code, text } = describeAuthError(err);
      setError(text);
      if (code === 'invalid_token') {
        setPassword('');
        setConfirm('');
        setDead(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <BackgroundStar />

      <div className="lg-sheet">
        <h1 className="lg-sr">Yabbyville — set a new password</h1>

        <div className="lg-mark" aria-hidden="true">
          <AsciiTitle />
        </div>

        <h2 className="lg-h">
          <span className="lg-h-label">new password</span>
          <span className="lg-h-rule" aria-hidden="true"></span>
          <span className="lg-h-note">members only</span>
        </h2>

        <div className="lg-band">
          {!token && (
            <p className="lg-msg lg-msg--bad" role="alert">
              this reset link is incomplete — ask an admin for a new one.
            </p>
          )}

          {token && done && (
            <p className="lg-msg lg-msg--good" role="status">
              password set. <Link to="/signin" className="si-inline-link">sign in</Link> with it now.
            </p>
          )}

          {token && !done && (
            <form onSubmit={handleSubmit} noValidate>
              <label className="lg-field">
                <span className="lg-label">new password</span>
                <input
                  ref={firstFieldRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy || dead}
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD}
                  aria-describedby="rp-hint"
                  className="lg-input"
                />
                <span id="rp-hint" className="si-hint">at least {MIN_PASSWORD} characters, not a common one.</span>
              </label>

              <label className="lg-field">
                <span className="lg-label">again</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy || dead}
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD}
                  className="lg-input"
                />
              </label>

              <div aria-live="assertive">
                {error && <p className="lg-msg lg-msg--bad">{error}</p>}
              </div>

              <div className="lg-actions">
                <Button
                  htmlType="submit"
                  disabled={busy || dead}
                  className="lg-submit basic-button--primary"
                  label={busy ? 'saving…' : 'set password'}
                />
              </div>
            </form>
          )}

          <div className="lg-tail si-tail">
            <Link to="/signin" className="lg-link si-link">sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
