import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useRateLimit } from '../utils/useRateLimit.ts';
import BackgroundStar from '../components/basic/Star';
import AsciiTitle from '../components/basic/AsciiTitle';
import { useAuthState } from 'react-firebase-hooks/auth';
import Button from '../components/basic/Button';
import { SUBTITLES } from '../utils/straplines';
import './Login.css';

const Login = () => {
  // Picked once per mount, not per render, so it holds still while you type.
  const [strapline] = useState(() => SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [user] = useAuthState(auth);

  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);

  // Rate limiting: 5 attempts per 15 minutes
  const { checkRateLimit, getRemainingAttempts, reset } = useRateLimit({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  });

  useEffect(() => {
    if (auth.currentUser) {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    // Check rate limit BEFORE attempting login
    if (!checkRateLimit()) {
      setError('too many attempts — wait 15 minutes before trying again.');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('that does not look like an email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      reset();
      navigate('/');
    } catch (error) {
      console.error('Login failed:', error);

      const remaining = getRemainingAttempts();

      if (error instanceof Error) {
        let errorMessage: string;

        if (error.message.includes('wrong-password') || error.message.includes('user-not-found')) {
          errorMessage = 'wrong email or password.';
        } else if (error.message.includes('too-many-requests')) {
          errorMessage = 'too many failed attempts — the account is locked for a while.';
        } else {
          errorMessage = 'login failed — try again.';
        }

        /* The count is this browser's own rate-limit budget, so saying it out
           loud costs nothing and saves a locked-out guess. */
        setError(remaining > 0 ? `${errorMessage} ${remaining} left before the wait.` : errorMessage);
      } else {
        setError('something went wrong — try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      setPasswordResetMessage('enter your email address first.');
      setPasswordResetSuccess(false);
      return;
    }

    setPasswordResetLoading(true);
    setPasswordResetMessage('');

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setPasswordResetMessage(
        `if an account exists for ${resetEmail}, a reset email is on its way.`
      );
      setPasswordResetSuccess(true);
    } catch (error) {
      console.error('Error with password reset:', error);
      setPasswordResetMessage('could not send the reset email — try again.');
      setPasswordResetSuccess(false);
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const togglePasswordReset = () => {
    setShowPasswordReset(!showPasswordReset);
    setPasswordResetMessage('');
    if (!showPasswordReset) {
      setResetEmail(email);
    }
  };

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="login-page">
      <BackgroundStar />

      <div className="lg-sheet">
        <h1 className="lg-sr">Yabbyville — log in</h1>

        <div className="lg-mark" aria-hidden="true">
          <AsciiTitle />
        </div>

        <form onSubmit={handleSubmit}>
          <h2 className="lg-h">
            <span className="lg-h-label">log in</span>
            <span className="lg-h-rule" aria-hidden="true"></span>
            <span className="lg-h-note">members only</span>
          </h2>

          <div className="lg-band">
            <label className="lg-field">
              <span className="lg-label">email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                className="lg-input"
              />
            </label>

            <label className="lg-field">
              <span className="lg-label">password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                className="lg-input"
              />
            </label>

            {error && (
              <p className="lg-msg lg-msg--bad" role="alert">{error}</p>
            )}

            <div className="lg-actions">
              <Button
                htmlType="submit"
                disabled={loading}
                className="lg-submit basic-button--primary"
                label={loading ? 'signing in…' : 'log in'}
              />
            </div>

            <div className="lg-tail">
              <button
                type="button"
                className={`lg-link${showPasswordReset ? ' is-open' : ''}`}
                onClick={togglePasswordReset}
                aria-expanded={showPasswordReset}
                aria-controls="lg-reset"
              >
                forgot your password?
                <span className="lg-caret" aria-hidden="true">›</span>
              </button>
            </div>

            <div id="lg-reset" className={`lg-reset${showPasswordReset ? ' is-open' : ''}`}>
              <div className="lg-reset-inner">
                <div className="lg-reset-body">
                  <h3 className="lg-reset-h">reset password</h3>

                  <label className="lg-field">
                    <span className="lg-label">email</span>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      disabled={passwordResetLoading}
                      autoComplete="email"
                      className="lg-input"
                    />
                  </label>

                  <Button
                    onClick={handlePasswordReset}
                    disabled={passwordResetLoading}
                    className="lg-reset-send"
                    label={passwordResetLoading ? 'sending…' : 'send reset email'}
                  />

                  {passwordResetMessage && (
                    <p
                      className={`lg-msg ${passwordResetSuccess ? 'lg-msg--good' : 'lg-msg--bad'}`}
                      role="status"
                    >
                      {passwordResetMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </form>

        <p className="lg-sub">{strapline}</p>
      </div>
    </div>
  );
};

export default Login;
