import React, { useState, useEffect } from 'react';
import Button from './Button'; 
import './Header.css';
import './TextAnimations.css'; 

interface HeaderProps {
  title: string;
  subtitle: string;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
        {/* Add floating animation classes to the title */}
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
            <li><a href="/profile" className="links">profile</a></li>
            <li><a href="/wiki" className="links">wiki</a></li>
          </ul>
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
        <a href="/profile" onClick={closeMobileMenu}>Profile</a>
        <a href="/wiki" onClick={closeMobileMenu}>Wiki</a>
      </div>
    </>
  );
};

export default Header;