import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebaseConfig';
import { describeAuthError, signIn, signOutLocal, verifyTwoFactor } from '../api/auth';
import {
  authErrorMessage,
  FIREBASE_REFUSED,
  isUnavailableCode,
  signInMethod,
  type SignInMethod,
} from '../utils/authFlow';
import { markLocalSignIn } from '../utils/localSession';
import BackgroundStar from '../components/basic/Star';
import AsciiTitle from '../components/basic/AsciiTitle';
import Button from '../components/basic/Button';
import TwoFactorEnrol from '../components/auth/TwoFactorEnrol';
import { SUBTITLES } from '../utils/straplines';
import './Login.css';
import './SignIn.css';

type Step = 'credentials' | 'two_factor' | 'enrol';

interface Failure {
  code: string;
  text: string;
}

const trackFailure = (reason: string) => window.umami?.track('signin_failure', { reason });

/** The self-hosted sign-in: username or email and password, checked by our server. */
const SignIn = () => {
  const [strapline] = useState(() => SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  const navigate = useNavigate();
  const location = useLocation();
  const [user] = useAuthState(auth);

  const [step, setStep] = useState<Step>('credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<SignInMethod>('username');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [info, setInfo] = useState('');

  // Passed once to the enrolment step, which clears its own copy after use.
  const enrolPassword = useRef('');
  // Set while the custom token is exchanged, so the redirect below does not
  // beat the marker and the event to it.
  const finishing = useRef(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  const passwordChanged = (location.state as { notice?: string } | null)?.notice === 'password_changed';
  const notice = info || (passwordChanged ? 'password changed — sign in again.' : '');

  // The profile sends a member here still signed in to Firebase and the
  // sign-out happens on arrival: done before the navigation, the private
  // route would see it first and redirect to /login.
  useEffect(() => {
    if (passwordChanged && user && !finishing.current) void signOut(auth);
  }, [passwordChanged, user]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (step === 'credentials') identifierRef.current?.focus();
    if (step === 'two_factor') codeRef.current?.focus();
  }, [step, useBackup]);

  // After the enrolment step has mounted and taken its copy.
  useEffect(() => {
    enrolPassword.current = '';
  }, [step]);

  const fail = (f: Failure) => {
    trackFailure(f.code);
    setFailure(f);
    if (f.code === 'no_challenge' || f.code === 'no_session') {
      setStep('credentials');
      setCode('');
    }
  };

  const restart = () => {
    setStep('credentials');
    setCode('');
    setUseBackup(false);
  };

  const finish = async (firebaseToken: string, twoFactor: boolean, how: SignInMethod) => {
    finishing.current = true;
    try {
      await signInWithCustomToken(auth, firebaseToken);
    } catch {
      finishing.current = false;
      // The server session must not outlive a sign-in Firebase refused.
      await signOutLocal().catch(() => undefined);
      fail({ code: FIREBASE_REFUSED, text: authErrorMessage(FIREBASE_REFUSED) });
      restart();
      return;
    }
    markLocalSignIn();
    window.umami?.track('signin_success', { method: how, two_factor: twoFactor });
    navigate('/', { replace: true });
  };

  const handleCredentials = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const id = identifier.trim();
    if (!id || !password) {
      setFailure({ code: 'local', text: 'enter your username or email and your password.' });
      return;
    }
    if (id.length > 254 || password.length > 128) {
      setFailure({ code: 'local', text: 'wrong username, email or password.' });
      return;
    }

    const how = signInMethod(id);
    setMethod(how);
    setBusy(true);
    setFailure(null);
    try {
      const result = await signIn(id, password);
      if (result.status === 'ok') {
        setPassword('');
        await finish(result.firebaseToken, false, how);
      } else if (result.status === 'two_factor') {
        setPassword('');
        setStep('two_factor');
      } else {
        enrolPassword.current = password;
        setPassword('');
        setStep('enrol');
      }
    } catch (err) {
      fail(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const answer = code.trim();
    if (!useBackup && !/^\d{6}$/.test(answer)) {
      setFailure({ code: 'local', text: 'the code is the 6 digits your app shows.' });
      return;
    }
    if (useBackup && (!answer || answer.length > 64)) {
      setFailure({ code: 'local', text: 'enter one of your backup codes.' });
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const result = await verifyTwoFactor(useBackup ? { backupCode: answer } : { code: answer });
      setCode('');
      await finish(result.firebaseToken, true, method);
    } catch (err) {
      setCode('');
      fail(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStartOver = async () => {
    // Enrolment runs on a session the server has already set.
    await signOutLocal().catch(() => undefined);
    setFailure(null);
    setInfo('');
    restart();
  };

  const handleAlreadyOn = async () => {
    // Turned on from another device meanwhile, which ended this session; the
    // next sign-in asks for a code instead.
    await signOutLocal().catch(() => undefined);
    setFailure(null);
    setInfo('two-step sign-in is already on — sign in again with your code.');
    restart();
  };

  if (user && !finishing.current && !passwordChanged) return <Navigate to="/" replace />;

  const errorRegion = (
    <div aria-live="assertive">
      {failure && (
        <p className="lg-msg lg-msg--bad">
          {isUnavailableCode(failure.code) ? (
            <>
              sign-in is unavailable right now. <Link to="/login" className="si-inline-link">the old login page</Link> still works.
            </>
          ) : (
            failure.text
          )}
        </p>
      )}
    </div>
  );

  return (
    <div className="login-page">
      <BackgroundStar />

      <div className="lg-sheet">
        <h1 className="lg-sr">Yabbyville — sign in</h1>

        <div className="lg-mark" aria-hidden="true">
          <AsciiTitle />
        </div>

        <h2 className="lg-h">
          <span className="lg-h-label">sign in</span>
          <span className="lg-h-rule" aria-hidden="true"></span>
          <span className="lg-h-note">members only</span>
        </h2>

        <div className="lg-band">
          {notice && step === 'credentials' && !failure && (
            <p className="lg-msg lg-msg--good" role="status">{notice}</p>
          )}

          {step === 'credentials' && (
            <form onSubmit={handleCredentials} noValidate>
              <label className="lg-field">
                <span className="lg-label">username or email</span>
                <input
                  ref={identifierRef}
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={busy}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={254}
                  className="lg-input"
                />
              </label>

              <label className="lg-field">
                <span className="lg-label">password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete="current-password"
                  maxLength={128}
                  className="lg-input"
                />
              </label>

              {errorRegion}

              <div className="lg-actions">
                <Button
                  htmlType="submit"
                  disabled={busy}
                  className="lg-submit basic-button--primary"
                  label={busy ? 'signing in…' : 'sign in'}
                />
              </div>
            </form>
          )}

          {step === 'two_factor' && (
            <form onSubmit={handleCode} noValidate>
              <h3 className="lg-reset-h">two-step sign-in</h3>
              {useBackup ? (
                <label className="lg-field">
                  <span className="lg-label">backup code</span>
                  <input
                    ref={codeRef}
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={64}
                    className="lg-input"
                  />
                </label>
              ) : (
                <label className="lg-field">
                  <span className="lg-label">6-digit code from your app</span>
                  <input
                    ref={codeRef}
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={busy}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    className="lg-input"
                  />
                </label>
              )}

              {errorRegion}

              <div className="lg-actions">
                <Button
                  htmlType="submit"
                  disabled={busy}
                  className="lg-submit basic-button--primary"
                  label={busy ? 'checking…' : 'continue'}
                />
              </div>

              <div className="lg-tail">
                <button
                  type="button"
                  className="lg-link"
                  disabled={busy}
                  onClick={() => {
                    setUseBackup(!useBackup);
                    setCode('');
                    setFailure(null);
                  }}
                >
                  {useBackup ? 'use the code from your app' : 'use a backup code'}
                </button>
              </div>
            </form>
          )}

          {step === 'enrol' && (
            <>
              <p className="lg-msg">this account needs two-step sign-in. set it up once to carry on.</p>
              <TwoFactorEnrol
                look="page"
                password={enrolPassword.current}
                onConfirmed={(token) => finish(token, true, method)}
                onFailure={trackFailure}
                onSessionEnded={() => {
                  setFailure({ code: 'no_session', text: authErrorMessage('no_session') });
                  restart();
                }}
                onAlreadyOn={() => void handleAlreadyOn()}
              />
              {errorRegion}
              <div className="lg-tail">
                <button type="button" className="lg-link" onClick={handleStartOver}>
                  start over
                </button>
              </div>
            </>
          )}

          <div className="lg-tail si-tail">
            <Link to="/login" className="lg-link si-link">old login</Link>
          </div>
        </div>

        <p className="lg-sub">{strapline}</p>
      </div>
    </div>
  );
};

export default SignIn;
