/**
 * ScrollProgress Component
 * Progress bar at top of page
 */

import React, { useState, useEffect } from 'react';

const ScrollProgress: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 h-[3px] bg-brand-primary z-[9999] transition-[width] duration-100 linear"
      style={{ width: `${progress}%` }}
    />
  );
};

export default ScrollProgress;
