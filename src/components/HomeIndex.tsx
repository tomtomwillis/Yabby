import { Link, useLocation } from 'react-router-dom';
import { useNavGroups, type NavLink } from './basic/navGroups';
import './HomeIndex.css';

/** Dropped from the rail: radio is the bottom bar's player, and stickers is the
 *  wall filling the top of the dashboard — a rail row for either is a second
 *  way to something already on screen. The rail is the only desktop nav, so
 *  nothing else comes out. navGroups is shared, and the mobile drawer built
 *  from it still lists everything. */
const HIDDEN_ON_HOME = new Set(['radio', 'stickers']);

/** The home sidebar's site index: nav groups as branches, their links one
 *  level deeper, drawn with box characters. */
const HomeIndex: React.FC = () => {
  const groups = useNavGroups();
  const { pathname } = useLocation();

  // Internal only — external links (Navidrome, Soulseek) never match a route
  // here. '/' is exact-only or every path would read as "on home"; everything
  // else also matches its own nested routes (e.g. /lists/:listId under /lists).
  const isActive = (link: NavLink) => !link.external && (
    link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`)
  );

  const row = (branch: string, key: string, link: NavLink) => {
    const className = `hi-link${link.badge ? ' has-badge' : ''}${isActive(link) ? ' is-active' : ''}`;
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
      {/* Home is the tree's root, so it carries the corner the heading used to. */}
      {row('┌─', 'home', { label: '🏠 home', href: '/' })}

      {groups.map((group, gi) => {
        const isLastGroup = gi === groups.length - 1;
        const links = group.links.filter(
          (l) => l.condition !== false && !HIDDEN_ON_HOME.has(l.label),
        );
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
