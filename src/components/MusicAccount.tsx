import { useEffect, useId, useState, type FormEvent } from 'react';

import { ApiError } from '../api/areaClient';
import {
  getMusicAccountStatus,
  linkMusicAccount,
  regenerateMusicPassword,
  unlinkMusicAccount,
  type MusicAccountStatus,
} from '../api/musicAccount';
import { refreshMusicSession, useMusicAccount } from '../utils/musicSession';
import { NAVIDROME_SERVER_URL } from '../utils/navidrome';
import './MusicAccount.css';

const SERVER_ADDRESS = NAVIDROME_SERVER_URL || 'https://music.yabbyville.xyz';

const formatDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

type Pending = 'link' | 'regenerate' | 'unlink';

/** Rows for the profile's account list: linking the member's own Navidrome
 *  account, and the music password for phone apps, shown once. Renders nothing
 *  unless the server says the feature is on, or the member still has a link
 *  from when it was. */
export default function MusicAccount() {
  const [account, setAccount] = useState<MusicAccountStatus | null>(null);
  const [fresh, setFresh] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Regenerating a stale link was refused: neither saved password works. */
  const [unrecoverable, setUnrecoverable] = useState(false);
  const playingAs = useMusicAccount();
  const id = useId();

  useEffect(() => {
    let live = true;
    getMusicAccountStatus()
      .then((status) => {
        if (live) setAccount(status);
      })
      // Off, not deployed or unreachable all read the same here: no section.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!account) return null;
  const offButLinked = !account.enabled && account.linked === true;
  if (!account.enabled && !offButLinked) return null;

  const linked = account.enabled && account.linked ? account : null;

  const handleLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim();
    if (busy || !name || !password) return;
    if (confirming !== 'link') {
      setConfirming('link');
      return;
    }
    const current = password;
    setPassword('');
    setConfirming(null);
    setBusy('link');
    setError(null);
    setCopied(false);
    try {
      const result = await linkMusicAccount(name, current);
      setFresh({ username: result.username, password: result.password });
      setUsername('');
      setAccount({
        enabled: true,
        linked: true,
        username: result.username,
        status: 'ok',
        linkedAt: result.linkedAt,
        passwordSetAt: result.passwordSetAt,
      });
      window.umami?.track('music-account-linked');
      void refreshMusicSession();
    } catch (e) {
      setError(messageOf(e, 'Could not link your account.'));
      // Linked elsewhere (another tab, another device): show what is there now.
      if (e instanceof ApiError && e.status === 409) {
        getMusicAccountStatus().then(setAccount).catch(() => undefined);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerate = async () => {
    if (!linked || busy) return;
    if (confirming !== 'regenerate') {
      setConfirming('regenerate');
      return;
    }
    setConfirming(null);
    setBusy('regenerate');
    setError(null);
    setCopied(false);
    try {
      const result = await regenerateMusicPassword();
      setFresh({ username: result.username, password: result.password });
      setAccount({ ...linked, username: result.username, status: 'ok', passwordSetAt: result.passwordSetAt });
      setUnrecoverable(false);
      window.umami?.track('music-password-regenerated');
      void refreshMusicSession();
    } catch (e) {
      setError(messageOf(e, 'Could not make a new music password.'));
      if (e instanceof ApiError && e.status === 409) {
        setAccount({ ...linked, status: 'stale' });
        setUnrecoverable(true);
        void refreshMusicSession();
      }
    } finally {
      setBusy(null);
    }
  };

  /** Offered on a stale link only once it cannot be recovered, and then it
   *  plays nothing as the member, so dropping it needs no confirm. */
  const handleUnlink = async () => {
    if ((!linked && !offButLinked) || busy) return;
    if (linked?.status !== 'stale' && confirming !== 'unlink') {
      setConfirming('unlink');
      return;
    }
    setConfirming(null);
    setBusy('unlink');
    setError(null);
    try {
      await unlinkMusicAccount();
      setFresh(null);
      setUnrecoverable(false);
      setAccount(account.enabled ? { enabled: true, linked: false } : { enabled: false });
      window.umami?.track('music-account-unlinked');
      void refreshMusicSession();
    } catch (e) {
      setError(messageOf(e, 'Could not unlink your account.'));
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.password);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the password and copy it by hand.');
    }
  };

  const handleDone = () => {
    setFresh(null);
    setCopied(false);
  };

  const cancel = () => setConfirming(null);

  const unlinkConfirm = confirming === 'unlink' && (
    <li className="me-row ma-block">
      <p className="ma-confirm" role="alert">
        <span>
          Unlink? The player here goes back to the shared account. Your Navidrome password stays the music
          password, so phone apps keep working.
        </span>
        <button type="button" className="me-act me-act--del" onClick={handleUnlink}>
          yes, unlink
        </button>
        <span className="me-sep" aria-hidden="true">·</span>
        <button type="button" className="me-act" onClick={cancel}>
          cancel
        </button>
      </p>
    </li>
  );

  const errorRow = error && (
    <li className="me-row">
      <span className="me-msg me-msg--bad ma-error" role="alert">{error}</span>
    </li>
  );

  if (offButLinked) {
    return (
      <>
        <li className="me-row">
          <span className="me-row-key">music account</span>
          <span className="me-row-leader" aria-hidden="true"></span>
          <span className="me-row-val">
            <button type="button" className="me-act me-act--del" onClick={handleUnlink} disabled={busy !== null}>
              {busy === 'unlink' ? 'unlinking…' : 'unlink'}
            </button>
          </span>
        </li>
        <li className="me-row ma-block">
          <p className="ma-text">Linked music accounts are switched off for now. You can still unlink yours.</p>
        </li>
        {unlinkConfirm}
        {errorRow}
      </>
    );
  }

  const summary = !linked ? 'not linked' : linked.status === 'stale' ? (unrecoverable ? 'needs linking again' : 'not working') : linked.username;

  return (
    <>
      <li className="me-row">
        <span className="me-row-key">music account</span>
        <span className="me-row-leader" aria-hidden="true"></span>
        <span className="me-row-val">{summary}</span>
      </li>

      {fresh && (
        <li className="me-row ma-block">
          <p className="ma-text">
            Your music password. It will not be shown again; to get another, make a new one here.
          </p>
          <div className="ma-secret-line">
            <code className="ma-secret" aria-label="Music password">{fresh.password}</code>
            <span className="ma-acts">
              <button type="button" className="me-act" onClick={handleCopy} aria-label="Copy music password">
                {copied ? 'copied' : 'copy'}
              </button>
              <span className="me-sep" aria-hidden="true">·</span>
              <button type="button" className="me-act" onClick={handleDone}>
                done
              </button>
            </span>
          </div>
          <dl className="ma-facts">
            <dt>server</dt>
            <dd>{SERVER_ADDRESS}</dd>
            <dt>username</dt>
            <dd>{fresh.username}</dd>
          </dl>
          <ol className="ma-steps">
            <li>Open the server settings in your music app (Symfonium, Amperfy, Feishin…).</li>
            <li>Keep the server and username, and replace the password with this one.</li>
            <li>Do the same in every app you use. Each one stops playing until you do.</li>
          </ol>
        </li>
      )}

      {!linked && (
        <li className="me-row ma-block">
          <p className="ma-text">
            Link your Navidrome account and the player here plays as you, so your plays and listening history are
            your own rather than the shared account's. You also get a music password for phone apps.
          </p>
          <p className="ma-text ma-warn">
            Linking replaces your current Navidrome password. Phone apps signed in with it (Symfonium, Amperfy,
            Feishin…) stop working until you give them the new music password.
          </p>
          <form className="ma-form" onSubmit={handleLink} aria-label="Link your Navidrome account">
            <div className="ma-fields">
              <div className="ma-field">
                <label className="me-label" htmlFor={`${id}-user`}>navidrome username</label>
                <input
                  id={`${id}-user`}
                  className="ma-input"
                  name="navidrome-username"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy !== null}
                />
              </div>
              <div className="ma-field">
                <label className="me-label" htmlFor={`${id}-pass`}>current navidrome password</label>
                <input
                  id={`${id}-pass`}
                  className="ma-input"
                  name="navidrome-password"
                  type="password"
                  // Not current-password: the browser would offer this site's
                  // own login, and offer to save the Navidrome one over it.
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy !== null}
                />
              </div>
            </div>
            {confirming === 'link' ? (
              <p className="ma-confirm" role="alert">
                <span>Replace your Navidrome password now?</span>
                <button type="submit" className="me-act me-act--del" disabled={busy !== null}>
                  yes, link
                </button>
                <span className="me-sep" aria-hidden="true">·</span>
                <button type="button" className="me-act" onClick={cancel}>
                  cancel
                </button>
              </p>
            ) : (
              <button
                type="submit"
                className="me-act"
                disabled={busy !== null || !username.trim() || !password}
              >
                {busy === 'link' ? 'linking…' : 'link and generate music password'}
              </button>
            )}
          </form>
        </li>
      )}

      {linked?.status === 'stale' && (
        <li className="me-row ma-block">
          {unrecoverable ? (
            <p className="ma-text ma-warn">
              Neither saved password works any more, so the player here is using the shared account. Unlink, then
              link again with your current Navidrome password.
            </p>
          ) : (
            <p className="ma-text ma-warn">
              Your music password no longer works, so the player here is using the shared account. Making a new one
              usually fixes this.
            </p>
          )}
          <span className="ma-acts">
            {unrecoverable ? (
              <button type="button" className="me-act" onClick={handleUnlink} disabled={busy !== null}>
                {busy === 'unlink' ? 'unlinking…' : 'unlink and link again'}
              </button>
            ) : (
              <button type="button" className="me-act" onClick={handleRegenerate} disabled={busy !== null}>
                {busy === 'regenerate' ? 'regenerating…' : 'regenerate music password'}
              </button>
            )}
          </span>
        </li>
      )}

      {linked?.status === 'ok' && !fresh && (
        <>
          <li className="me-row ma-item">
            <span className="me-row-key">password set</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">{formatDay(linked.passwordSetAt)}</span>
          </li>
          <li className="me-row ma-item">
            <span className="me-row-key">player here</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">{playingAs === 'own' ? 'your account' : 'shared account'}</span>
          </li>
          <li className="me-row ma-item">
            <span className="me-row-key">music password</span>
            <span className="me-row-leader" aria-hidden="true"></span>
            <span className="me-row-val">
              <button type="button" className="me-act" onClick={handleRegenerate} disabled={busy !== null}>
                {busy === 'regenerate' ? 'regenerating…' : 'regenerate'}
              </button>
              <span className="me-sep" aria-hidden="true"> · </span>
              <button type="button" className="me-act me-act--del" onClick={handleUnlink} disabled={busy !== null}>
                {busy === 'unlink' ? 'unlinking…' : 'unlink'}
              </button>
            </span>
          </li>
        </>
      )}

      {confirming === 'regenerate' && linked && !fresh && (
        <li className="me-row ma-block">
          <p className="ma-confirm" role="alert">
            <span>Make a new music password? Phone apps stop playing until you give them the new one.</span>
            <button type="button" className="me-act me-act--del" onClick={handleRegenerate}>
              yes, regenerate
            </button>
            <span className="me-sep" aria-hidden="true">·</span>
            <button type="button" className="me-act" onClick={cancel}>
              cancel
            </button>
          </p>
        </li>
      )}
      {!fresh && unlinkConfirm}

      {errorRow}
    </>
  );
}
