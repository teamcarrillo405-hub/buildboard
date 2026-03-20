/**
 * MainLayout
 * Dark theme wrapper with navigation, scroll progress, and footer
 */

import React from 'react';
import Navigation from '../components/Navigation';
import Footer from '../components/Footer';
import ScrollProgress from '../components/ScrollProgress';


interface MainLayoutProps {
  children: React.ReactNode;
  onSearch?: (query: string) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, onSearch }) => {
  return (
    <div className="min-h-screen bg-background text-white">
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <ScrollProgress />
      <Navigation onSearch={onSearch} />
      <main id="main-content">{children}</main>
      <Footer />
    </div>
  );
};

export default MainLayout;
