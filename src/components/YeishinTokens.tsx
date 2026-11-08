import { useCallback, useEffect, useState } from 'react';

import { listApiTokens, mintApiToken, revokeApiToken, type ApiToken } from '../api/apiTokens';
import './YeishinTokens.css';

const formatDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Rows for the profile's account list: the member's Yeishin tokens, a way to
 *  make one, and the new token shown once. Rendered only for admins. */
export default function YeishinTokens() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens(await listApiTokens());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tokens.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMint = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const minted = await mintApiToken('Yeishin');
      setFresh(minted.token);
      window.umami?.track('yeishin_token_mint');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make a token.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeApiToken(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke the token.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the token and copy it by hand.');
    }
  };

  return (
    <>
      <li className="me-row">
        <span className="me-row-key">yeishin tokens</span>
        <span className="me-row-leader" aria-hidden="true"></span>
        <span className="me-row-val">
          <button type="button" className="me-act" onClick={handleMint} disabled={busy}>
            new token
          </button>
        </span>
      </li>

      {fresh && (
        <li className="me-row yt-fresh">
          <code className="yt-token">{fresh}</code>
          <span className="yt-fresh-acts">
            <button type="button" className="me-act" onClick={handleCopy}>
              {copied ? 'copied' : 'copy'}
            </button>
            <span className="me-sep" aria-hidden="true">·</span>
            <button type="button" className="me-act" onClick={() => setFresh(null)}>
              done
            </button>
          </span>
          <span className="yt-note">Paste into Yeishin's Yabby settings. It will not be shown again.</span>
        </li>
      )}

      {tokens?.map((token) => (
        <li className="me-row yt-item" key={token.id}>
          <span className="me-row-key">
            {token.label} · made {formatDay(token.created)} · {token.lastUsed ? `used ${formatDay(token.lastUsed)}` : 'never used'}
          </span>
          <span className="me-row-leader" aria-hidden="true"></span>
          <span className="me-row-val">
            <button
              type="button"
              className="me-act me-act--del"
              onClick={() => handleRevoke(token.id)}
              disabled={busy}
            >
              revoke
            </button>
          </span>
        </li>
      ))}

      {error && (
        <li className="me-row">
          <span className="me-msg me-msg--bad yt-error" role="status">{error}</span>
        </li>
      )}
    </>
  );
}
