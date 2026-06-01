import React, { useState, useEffect, useRef } from 'react';
import Button from './Button';
import { useMediaManager } from '../../utils/useMediaManager';
import './Header.css';
import './TextAnimations.css';

interface NavLink {
  label: string;
  href: string;
  external?: true;
  condition?: boolean;
}

interface NavGroup {
  name: string;
  links: NavLink[];
}

interface HeaderProps {
  title: string;
  subtitle: string;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { isMediaManager } = useMediaManager();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => setActiveGroup(null), 2500);
  };

  useEffect(() => () => clearHideTimeout(), []);

  const navGroups: NavGroup[] = [
    {
      name: 'Music',
      links: [
        { label: 'listen', href: import.meta.env.VITE_NAVIDROME_SERVER_URL, external: true },
        { label: 'upload', href: '/upload' },
        { label: 'request', href: import.meta.env.VITE_SLSK_REQUEST_URL, external: true },
        { label: 'radio', href: '/radio' },
      ],
    },
    {
      name: 'Social',
      links: [
        { label: 'message board', href: '/messageboard' },
        { label: 'travel', href: '/travel' },
        { label: 'lists', href: '/lists' },
        { label: 'film club', href: '/film-club' },
        { label: 'stickers', href: '/stickers' },
      ],
    },
    {
      name: 'Yabby',
      links: [
        { label: 'profile', href: '/profile' },
        { label: 'news', href: '/news' },
        { label: 'wiki', href: '/wiki' },
        { label: 'media management', href: '/media', condition: isMediaManager },
      ],
    },
  ];

  const toggleMobileMenu = () => setIsMobileMenuOpen(open => !open);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileMenu();
    };

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    };
  }, [isMobileMenuOpen]);

  const activeGroupLinks =
    navGroups.find(g => g.name === activeGroup)?.links.filter(l => l.condition !== false) ?? [];

  return (
    <>
      <header className="header">
        <h1 className="animated-text float-gentle">{title}</h1>
        <span className="small-text animated-text float-subtle">{subtitle}</span>

        {/* Desktop Navigation */}
        <nav className="desktop-nav" onMouseLeave={scheduleHide} onMouseEnter={clearHideTimeout}>
          <ul className="nav-groups">
            <li>
              <a href="/" className="links">🏠</a>
            </li>
            {navGroups.map(group => (
              <li key={group.name}>
                <button
                  className={`nav-group-btn links${activeGroup === group.name ? ' active' : ''}`}
                  onMouseEnter={() => { clearHideTimeout(); setActiveGroup(group.name); }}
                  onClick={() => setActiveGroup(prev => prev === group.name ? null : group.name)}
                >
                  {group.name.toLowerCase()}
                </button>
              </li>
            ))}
          </ul>

          {activeGroup && (
            <ul className="nav-links group-links">
              {activeGroupLinks.map(link => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="links"
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noopener noreferrer' : undefined}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <hr />
      </header>

      {/* Burger Menu Button */}
      <Button
        type="basic"
        label={isMobileMenuOpen ? '✕' : '☰'}
        onClick={toggleMobileMenu}
        className="burger-menu"
      />

      {/* Mobile Navigation Overlay */}
      <div
        className={`mobile-nav-overlay ${isMobileMenuOpen ? 'active' : ''}`}
        onClick={closeMobileMenu}
      />

      {/* Mobile Navigation Menu */}
      <div className={`mobile-nav ${isMobileMenuOpen ? 'active' : ''}`}>
        <a href="/" onClick={closeMobileMenu}>🏠 Home</a>
        {navGroups.map(group => (
          <React.Fragment key={group.name}>
            <span className="mobile-nav-group-header">{group.name}</span>
            <div className="mobile-nav-sublinks">
              {group.links
                .filter(l => l.condition !== false)
                .map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={closeMobileMenu}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noopener noreferrer' : undefined}
                  >
                    {link.label}
                  </a>
                ))}
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
  );
};

export default Header;
