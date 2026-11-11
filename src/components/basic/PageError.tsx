import type { FallbackProps } from 'react-error-boundary';
import '../../pages/NotFound.css';

/** What a page shows in place of itself when it throws while rendering. The
 *  shell around it keeps running, so the rail and the player still work. */
function PageError({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="nf-page" role="alert">
      <div className="nf-bar">
        <span className="nf-bar-label">something broke</span>
        <span className="nf-bar-rule" aria-hidden="true"></span>
        <span className="nf-bar-note">this page could not be shown</span>
      </div>

      <p className="nf-note">
        <button type="button" className="hp-af" onClick={resetErrorBoundary}>Try again</button>
        {' '}or{' '}
        <button type="button" className="hp-af" onClick={() => window.location.reload()}>reload the site</button>.
      </p>
    </div>
  );
}

export default PageError;
