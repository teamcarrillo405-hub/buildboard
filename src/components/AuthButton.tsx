/**
 * AuthButton
 * Navbar authentication button with login/logout functionality.
 *
 * - Unauthenticated: "Sign In" button (gold outline)
 * - Loading: subtle pulse placeholder
 * - Authenticated: initials avatar + dropdown with name and "Sign Out"
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, LogOut, ChevronDown, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AuthButton: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const firstMenuItemRef = useRef<HTMLAnchorElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus first menu item when dropdown opens
  useEffect(() => {
    if (isOpen) {
      firstMenuItemRef.current?.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  // Loading state — subtle skeleton
  if (isLoading) {
    return (
      <div className="w-9 h-9 rounded-full bg-surface animate-pulse flex-shrink-0" />
    );
  }

  // Unauthenticated — Sign In button
  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={login}
        className="flex items-center gap-2 px-4 py-2 border border-brand-gold text-brand-gold rounded
                   text-sm font-display font-semibold uppercase tracking-wider
                   hover:bg-brand-gold/10 transition-colors flex-shrink-0"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">Sign In</span>
      </button>
    );
  }

  // Authenticated — avatar + dropdown
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <div className="relative flex-shrink-0" ref={dropdownRef}>
      {/* Avatar trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 group"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div
          className="w-9 h-9 rounded-full bg-brand-gold/20 border border-brand-gold/40
                      flex items-center justify-center text-brand-gold text-sm font-bold
                      group-hover:bg-brand-gold/30 transition-colors"
        >
          {initials}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-muted transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          role="menu"
          onKeyDown={handleKeyDown}
          className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border
                      rounded-lg shadow-xl shadow-black/40 overflow-hidden z-50 animate-fade-in"
        >
          {/* User info */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-white truncate">{fullName}</p>
            <p className="text-xs text-text-muted truncate">{user.email}</p>
          </div>

          {/* Admin Panel link */}
          <Link
            ref={firstMenuItemRef}
            role="menuitem"
            to="/admin"
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-muted
                       hover:bg-background hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            Admin Panel
          </Link>

          {/* Sign Out */}
          <button
            role="menuitem"
            onClick={async () => {
              setIsOpen(false);
              await logout();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-text-muted
                       hover:bg-background hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default AuthButton;
