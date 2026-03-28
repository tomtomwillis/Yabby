import React, { useState, useEffect } from 'react';
import Button from './Button';
import { useMediaManager } from '../../utils/useMediaManager';
import './Header.css';
import './TextAnimations.css';

interface HeaderProps {
  title: string;
  subtitle: string;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { isMediaManager } = useMediaManager();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileMenu();
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header className="header">
        <h1 className="animated-text float-gentle">{title}</h1>
        <span className="small-text animated-text float-subtle">{subtitle}</span>

        {/* Desktop Navigation */}
        <nav className="desktop-nav">
          <ul className="nav-links top-links">
            <li><a href="/" className="links">🏠 </a></li>
            <li>
              <a
                href={import.meta.env.VITE_NAVIDROME_SERVER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="links"
              >
                listen
              </a>
            </li>
            <li><a href="/upload" className="links">upload</a></li>
            <li>
              <a
                href={import.meta.env.VITE_SLSK_REQUEST_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="links"
              >
                request
              </a>
            </li>
          </ul>

          <ul className="nav-links bottom-links">
            <li><a href="/messageboard" className="links">message&nbsp;board</a></li>
            <li><a href="/lists" className="links">lists</a></li>
            <li><a href="/profile" className="links">profile</a></li>
            <li>
              <button className="more-button" onClick={() => setIsMoreOpen(!isMoreOpen)}>
                {isMoreOpen ? '−more' : '+more'}
              </button>
            </li>
          </ul>

          {isMoreOpen && (
            <ul className="nav-links more-links">
              <li><a href="/news" className="links">news</a></li>
              <li><a href="/wiki" className="links">wiki</a></li>
              <li><a href="/stickers" className="links">stickers</a></li>
              <li><a href="/radio" className="links">radio</a></li>
              <li><a href="/film-club" className="links">film&nbsp;club</a></li>
              {isMediaManager && (
                <li><a href="/media" className="links">media&nbsp;management</a></li>
              )}
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
        <a href="/" onClick={closeMobileMenu}>Home</a>
        <a
          href={import.meta.env.VITE_NAVIDROME_SERVER_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeMobileMenu}
        >
          Listen
        </a>
        <a href="/upload" onClick={closeMobileMenu}>Upload</a>
        <a
          href={import.meta.env.VITE_SLSK_REQUEST_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeMobileMenu}
        >
          Request
        </a>
        <a href="/messageboard" onClick={closeMobileMenu}>Message Board</a>
        <a href="/lists" onClick={closeMobileMenu}>Lists</a>
        <a href="/profile" onClick={closeMobileMenu}>Profile</a>
        <a href="/news" onClick={closeMobileMenu}>News</a>
        <a href="/wiki" onClick={closeMobileMenu}>Wiki</a>
        <a href="/stickers" onClick={closeMobileMenu}>Stickers</a>
        <a href="/radio" onClick={closeMobileMenu}>Radio</a>
        <a href="/film-club" onClick={closeMobileMenu}>Film Club</a>
        {isMediaManager && (
          <a href="/media" onClick={closeMobileMenu}>Media Management</a>
        )}
      </div>
    </>
  );
};

export default Header;
