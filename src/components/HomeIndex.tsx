import { Link } from 'react-router-dom';
import { useNavGroups, type NavLink } from './basic/navGroups';
import './HomeIndex.css';

/** The home sidebar's site index: nav groups as branches, their links one
 *  level deeper, drawn with box characters. */
const HomeIndex: React.FC = () => {
  const groups = useNavGroups();

  const row = (branch: string, key: string, link: NavLink) => {
    const className = `hi-link${link.badge ? ' has-badge' : ''}`;
    const content = (
      <>
        {link.label}
        {link.badge ? <span className="nav-badge">{link.badge}</span> : null}
      </>
    );
    return (
      <div className="hi-row" key={key}>
        <span className="hi-branch" aria-hidden="true">{branch}</span>
        {link.external ? (
          <a href={link.href} className={className} target="_blank" rel="noopener noreferrer">
            {content}
          </a>
        ) : (
          <Link to={link.href} className={className}>{content}</Link>
        )}
      </div>
    );
  };

  return (
    <nav className="home-index" aria-label="Site index">
      <div className="hi-head">
        <span className="hi-branch" aria-hidden="true">┌</span>
        <span className="hi-title">index</span>
        <span className="hi-rule" aria-hidden="true" />
      </div>

      {row('├─', 'home', { label: '🏠 home', href: '/' })}

      {groups.map((group, gi) => {
        const isLastGroup = gi === groups.length - 1;
        const links = group.links.filter((l) => l.condition !== false);
        return (
          <div className="hi-group" key={group.name}>
            <div className="hi-row hi-row--group">
              <span className="hi-branch" aria-hidden="true">{isLastGroup ? '└─' : '├─'}</span>
              <span className="hi-groupname">{group.name.toLowerCase()}</span>
            </div>
            {links.map((link, li) =>
              row(
                `${isLastGroup ? '   ' : '│  '}${li === links.length - 1 ? '└─' : '├─'}`,
                link.href + link.label,
                link,
              ),
            )}
          </div>
        );
      })}
    </nav>
  );
};

export default HomeIndex;
