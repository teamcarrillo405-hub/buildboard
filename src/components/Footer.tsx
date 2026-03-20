/**
 * Footer Component
 * HCC branded 4-column footer with gold accents
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Linkedin, Facebook, Youtube } from 'lucide-react';

const SectionLabel: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-2 mb-4">
    <div className="w-[3px] h-[14px] bg-[#F5C518]" />
    <span className="font-display text-[10px] font-bold tracking-[0.2em] uppercase text-[#F5C518]">
      {text}
    </span>
  </div>
);

const FooterLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <li>
    <Link
      to={to}
      className="text-white text-sm hover:text-[#F5C518] transition-colors"
    >
      {children}
    </Link>
  </li>
);

const Footer: React.FC = () => {
  return (
    <footer className="bg-black pt-14 pb-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-[4%]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Column 1: Logo + Tagline + Social */}
          <div>
            <Link to="/" className="inline-block mb-4">
              <img
                src="/hcc-logo-white.svg"
                alt="Hispanic Construction Council"
                className="h-10"
              />
            </Link>
            <Link
              to="/"
              className="block font-display text-xl font-bold text-white uppercase tracking-[0.05em] mb-2"
            >
              BuildBoard
            </Link>
            <p className="text-[#999999] text-sm mb-6 leading-relaxed">
              The official directory of the Hispanic Construction Council. Connecting contractors, builders, and trades across America.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="text-white/60 hover:text-[#F5C518] transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-white/60 hover:text-[#F5C518] transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-white/60 hover:text-[#F5C518] transition-colors"
                aria-label="YouTube"
              >
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Column 2: Resources */}
          <div>
            <SectionLabel text="RESOURCES" />
            <ul className="space-y-3">
              <FooterLink to="#">Data Hub</FooterLink>
              <FooterLink to="#">Reports</FooterLink>
              <FooterLink to="#">Blog</FooterLink>
            </ul>
          </div>

          {/* Column 3: Directory */}
          <div>
            <SectionLabel text="DIRECTORY" />
            <ul className="space-y-3">
              <FooterLink to="/">Browse Trades</FooterLink>
              <FooterLink to="#">Top Rated</FooterLink>
              <FooterLink to="#">By State</FooterLink>
              <FooterLink to="#">Search</FooterLink>
            </ul>
          </div>

          {/* Column 4: Connect */}
          <div>
            <SectionLabel text="CONNECT" />
            <ul className="space-y-3">
              <FooterLink to="#">Contact HCC</FooterLink>
              <FooterLink to="#">About HCC</FooterLink>
              <FooterLink to="#">Membership</FooterLink>
              <FooterLink to="#">News</FooterLink>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10 mt-12 py-5 px-[4%] flex flex-col sm:flex-row justify-between items-center gap-3">
        <span className="text-white/30 text-sm">
          &copy; {new Date().getFullYear()} Hispanic Construction Council. BuildBoard Directory.
        </span>
        <div className="flex gap-6 text-white/30 text-sm">
          <Link to="#" className="hover:text-white/60 transition-colors">
            Privacy Policy
          </Link>
          <Link to="#" className="hover:text-white/60 transition-colors">
            Terms of Use
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
