import { Link } from 'react-router-dom';
import Header from '../components/basic/Header';

/** Renders inside the home shell, so the rail and player are still there to
 *  leave by — the point is not to strand anyone on a blank page. */
function NotFound() {
  return (
    <div className="app-container">
      <Header title="404" subtitle="nothing here" />
      <p className="hp-note">
        That page doesn't exist. <Link to="/">Back to the front page</Link>.
      </p>
    </div>
  );
}

export default NotFound;
