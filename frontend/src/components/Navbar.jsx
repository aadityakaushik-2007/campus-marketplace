import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { useState, useEffect, useRef } from 'react'
import './Navbar.css'
import logo from '../assets/logo.png'
import { beginLogin } from '../auth/navigation'

function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.body.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  return (
    <label className="switch" aria-label="Toggle Theme">
      <input
        type="checkbox"
        checked={isDarkMode}
        onChange={(e) => setIsDarkMode(e.target.checked)}
      />
      <span className="slider" />
    </label>
  );
}

export default function Navbar() {
  const { isAuthenticated, loginWithRedirect, logout } = useAuth0()
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef(null)
  const menuButtonRef = useRef(null)
  const closeMenu = () => setMenuOpen(false)

  // State to track if navbar is visible
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 50 && !menuOpen) {
        setIsVisible(false); 
      } else {
        setIsVisible(true);  
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') { closeMenu(); menuButtonRef.current?.focus() }
    }
    const closeOnOutsideClick = (event) => {
      if (!navRef.current?.contains(event.target)) closeMenu()
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
  }, [menuOpen])

  return (
    <nav ref={navRef} className={`navbar ${isVisible || menuOpen ? "" : "navbar-hidden"}`}>
      <div className="navbar-left">
        <Link to="/">
          <img src={logo} alt="Campus Marketplace Logo" className="navbar-logo" />
        </Link>
        <Link to="/" className="navbar-brand">
          Campus Marketplace
        </Link>
      </div>
      <button ref={menuButtonRef} type="button" className="mobile-menu-toggle" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => { setIsVisible(true); setMenuOpen((open) => !open) }}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d={menuOpen ? 'M5 5l14 14M19 5L5 19' : 'M3 6h18M3 12h18M3 18h18'} /></svg>
        <span>Menu</span>
      </button>
      <div id="primary-navigation" className={`navbar-links${menuOpen ? ' mobile-menu-open' : ''}`} aria-label="Main navigation">
        <ThemeToggle />
        <Link to="/" onClick={closeMenu}>Home</Link>
        <Link to="/browse" onClick={closeMenu}>Browse</Link>
        <Link to="/users" onClick={closeMenu}>People</Link>
        {isAuthenticated ? (
          <>
            <Link to="/profile" onClick={closeMenu}>Profile</Link>
            <button
              className="navbar-logout"
              onClick={() => { closeMenu(); logout({ logoutParams: { returnTo: window.location.origin } }) }}
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <button className="navbar-link-btn" onClick={() => { closeMenu(); beginLogin(loginWithRedirect) }}>
              Log in
            </button>
            <button
              className="button"
              onClick={() =>
                { closeMenu(); beginLogin(loginWithRedirect, { authorizationParams: { screen_hint: 'signup' } }) }
              }
            >
              Sign up
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
