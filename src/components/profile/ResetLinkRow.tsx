import React, { useEffect, useRef, useState } from 'react';
import { describeAuthError, issueResetLink, type ResetLink } from '../../api/auth';
import { formatExpiry } from '../../utils/authFlow';
import { localSessionEnded } from '../../utils/localSession';
import './AccountAuthRows.css';

/** Admin row: a one-time password reset link for a member, shown once. */
const ResetLinkRow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A bearer link: kept in state only, and dropped with "done".
  const [link, setLink] = useState<ResetLink | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !link) inputRef.current?.focus();
  }, [open, link]);

  const close = () => {
    setOpen(false);
    setIdentifier('');
    setError('');
    setLink(null);
    setCopied(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const target = identifier.trim();
    if (!target) {
      setError("enter the member's username or email.");
      return;
    }
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      setLink(await issueResetLink(target));
      setIdentifier('');
    } catch (err) {
      const { code, text } = describeAuthError(err);
      setError(text);
      if (code === 'no_session') void localSessionEnded();
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setError('copy failed — select the link and copy it by hand.');
    }
  };

  const expiry = link ? formatExpiry(link.expiresAt) : '';

  return (
    <>
      <li className="me-row">
        <span className="me-row-key">password reset link</span>
        <span className="me-row-leader" aria-hidden="true"></span>
        <span className="me-row-val">
          <button
            type="button"
            className="me-act"
            onClick={() => (open ? close() : setOpen(true))}
            aria-expanded={open}
            aria-controls="aa-reset-link"
          >
            {open ? 'done' : 'make a link'}
          </button>
        </span>
      </li>

      {open && (
        <li className="aa-panel" id="aa-reset-link">
          {link ? (
            <div role="status">
              <code className="aa-link">{link.url}</code>
              <div className="aa-actions">
                <button type="button" className="me-act" onClick={handleCopy}>
                  {copied ? 'copied' : 'copy'}
                </button>
                <span className="me-sep" aria-hidden="true">·</span>
                <button type="button" className="me-act" onClick={() => setLink(null)}>
                  another
                </button>
              </div>
              <span className="aa-hint">
                works once{expiry ? `, until ${expiry}` : ''}. send it to the member privately — it will not be shown again.
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <label className="aa-field">
                <span className="me-label">member's username or email</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  className="aa-input"
                />
              </label>
              <div className="aa-actions">
                <button type="submit" className="me-act" disabled={busy}>
                  {busy ? 'making…' : 'make link'}
                </button>
              </div>
            </form>
          )}
          <div aria-live="assertive">
            {error && <p className="me-msg me-msg--in-band me-msg--bad">{error}</p>}
          </div>
        </li>
      )}
    </>
  );
};

export default ResetLinkRow;
