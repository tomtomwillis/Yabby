import React, { useEffect, useRef, useState } from 'react';
import { confirmTwoFactor, describeAuthError, enrolTwoFactor, type TwoFactorEnrolment } from '../../api/auth';
import { groupSecret, secretFromTotpUri } from '../../utils/authFlow';
import Button from '../basic/Button';
import './TwoFactorEnrol.css';

/* Class names for the two places this is shown: the sign-in sheet (Login.css)
   and a row of the profile's account list (Profile.css, AccountAuthRows.css). */
const LOOKS = {
  page: { field: 'lg-field', label: 'lg-label', input: 'lg-input', msg: 'lg-msg', bad: 'lg-msg--bad', heading: 'lg-reset-h' },
  row: { field: 'aa-field', label: 'me-label', input: 'aa-input', msg: 'me-msg me-msg--in-band', bad: 'me-msg--bad', heading: 'aa-h' },
} as const;

interface TwoFactorEnrolProps {
  look: 'page' | 'row';
  /** The password just typed on the sign-in page; without it the member is asked. */
  password?: string;
  /** Receives the token /two-factor/confirm returns. */
  onConfirmed: (firebaseToken: string) => void | Promise<void>;
  onFailure?: (code: string) => void;
  /** The server no longer has the session the enrolment hangs off. */
  onSessionEnded?: () => void;
}

/** Turning on two-step sign-in: password, then the QR, secret and backup codes, then a first code. */
const TwoFactorEnrol: React.FC<TwoFactorEnrolProps> = ({
  look,
  password: givenPassword,
  onConfirmed,
  onFailure,
  onSessionEnded,
}) => {
  const css = LOOKS[look];
  // Held only until the enrol request has gone.
  const [password, setPassword] = useState(givenPassword ?? '');
  const [enrolment, setEnrolment] = useState<TwoFactorEnrolment | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const scanHeadingRef = useRef<HTMLHeadingElement>(null);

  const fail = (err: unknown) => {
    const { code: failure, text } = describeAuthError(err);
    onFailure?.(failure);
    setError(text);
    if (failure === 'no_session') onSessionEnded?.();
  };

  const start = async (currentPassword: string) => {
    setBusy(true);
    setError('');
    try {
      setEnrolment(await enrolTwoFactor(currentPassword));
    } catch (err) {
      fail(err);
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (started.current || !givenPassword) return;
    started.current = true;
    void start(givenPassword);
    // Runs once, with the password the page handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enrolment && !busy) passwordRef.current?.focus();
  }, [enrolment, busy]);

  useEffect(() => {
    // The heading rather than the code field: the codes above it come first.
    if (enrolment) scanHeadingRef.current?.focus();
  }, [enrolment]);

  useEffect(() => {
    if (!enrolment) return;
    let live = true;
    // Drawn here: the URI holds the secret, so it never goes to a QR service.
    void import('qrcode')
      .then((mod) => {
        // A CommonJS package: the functions may sit on the default export.
        const qrcode = ('default' in mod ? mod.default : mod) as typeof mod;
        return qrcode.toDataURL(enrolment.totpUri, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
      })
      .then((url) => { if (live) setQr(url); })
      .catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [enrolment]);

  const handlePassword = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password) {
      setError('enter your password first.');
      return;
    }
    void start(password);
  };

  const handleCopy = async () => {
    if (!enrolment) return;
    try {
      await navigator.clipboard.writeText(enrolment.backupCodes.join('\n'));
      setCopied(true);
    } catch {
      setError('copy failed — select the codes and copy them by hand.');
    }
  };

  const handleConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('the code is the 6 digits your app shows.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { firebaseToken } = await confirmTwoFactor(code);
      window.umami?.track('two_factor_enrolled');
      setEnrolment(null);
      await onConfirmed(firebaseToken);
    } catch (err) {
      fail(err);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const submit = (label: string, busyLabel: string) =>
    look === 'page' ? (
      <div className="lg-actions">
        <Button htmlType="submit" disabled={busy} className="lg-submit basic-button--primary" label={busy ? busyLabel : label} />
      </div>
    ) : (
      <div className="aa-actions">
        <button type="submit" className="me-act" disabled={busy}>{busy ? busyLabel : label}</button>
      </div>
    );

  const errorLine = (
    <div aria-live="assertive">
      {error && <p className={`${css.msg} ${css.bad}`}>{error}</p>}
    </div>
  );

  if (!enrolment) {
    if (busy) {
      return (
        <div className="tf" aria-busy="true">
          <p className={css.msg} role="status">setting up…</p>
        </div>
      );
    }
    return (
      <form className="tf" onSubmit={handlePassword}>
        <h3 className={css.heading}>turn on two-step sign-in</h3>
        <label className={css.field}>
          <span className={css.label}>password</span>
          <input
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
            maxLength={128}
            className={css.input}
          />
        </label>
        {errorLine}
        {submit('continue', 'checking…')}
      </form>
    );
  }

  const secret = secretFromTotpUri(enrolment.totpUri);

  return (
    <form className="tf" onSubmit={handleConfirm}>
      <h3 className={css.heading} ref={scanHeadingRef} tabIndex={-1}>scan this with your authenticator app</h3>

      <div className="tf-qr">
        {qr ? (
          <img src={qr} width={220} height={220} alt="QR code for your authenticator app" />
        ) : (
          <span className="tf-qr-wait" aria-hidden="true">drawing…</span>
        )}
      </div>

      {secret && (
        <p className="tf-secret">
          <span className="tf-secret-label">or type this key in:</span>
          <code className="tf-secret-key">{groupSecret(secret)}</code>
        </p>
      )}

      <div className="tf-backup">
        <p className="tf-backup-note">
          <strong>save these backup codes now — they are shown once.</strong> each one signs you in once if you lose your phone.
        </p>
        <ol className="tf-codes">
          {enrolment.backupCodes.map((backup) => (
            <li key={backup}><code>{backup}</code></li>
          ))}
        </ol>
        <button type="button" className="tf-copy" onClick={handleCopy}>
          {copied ? 'copied' : 'copy backup codes'}
        </button>
      </div>

      <label className={css.field}>
        <span className={css.label}>6-digit code from the app</span>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          disabled={busy}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          className={css.input}
        />
      </label>
      {errorLine}
      {submit('turn it on', 'checking…')}
    </form>
  );
};

export default TwoFactorEnrol;
