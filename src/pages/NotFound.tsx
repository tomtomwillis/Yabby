import { Link } from 'react-router-dom';
import Header from '../components/basic/Header';
import './NotFound.css';

/** Renders inside the home shell, so the rail and player are still there to
 *  leave by — the point is not to strand anyone on a blank page. */
function NotFound() {
  return (
    <div className="nf-page">
      <Header title="404" subtitle="nothing here" />

      <div className="nf-bar">
        <span className="nf-bar-label">not found</span>
        <span className="nf-bar-rule" aria-hidden="true"></span>
        <span className="nf-bar-note">no such page</span>
      </div>

      <p className="nf-note">
        That page doesn't exist. <Link to="/">Back to the front page</Link>, or take
        anything from the index.
      </p>
    </div>
  );
}

export default NotFound;
