/**
 * NotFound (404) Page
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';

const POPULAR_CATEGORIES = ['Plumbing', 'Electrical', 'Roofing', 'HVAC', 'Painting', 'Landscaping'];

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-[4%]">
      <div className="max-w-lg w-full text-center py-20">
        {/* 404 */}
        <div className="mb-6">
          <p className="font-display text-[8rem] font-bold text-[#F5C518]/10 leading-none select-none">
            404
          </p>
          <div className="w-12 h-1 bg-[#F5C518] mx-auto -mt-4 mb-6" />
          <h1 className="font-display text-[1.8rem] font-bold uppercase tracking-[0.05em] text-white mb-3">
            Page Not Found
          </h1>
          <p className="text-[#999999] text-[0.95rem] leading-relaxed mb-8">
            The page you're looking for doesn't exist or may have been moved.
            Try searching for a contractor instead.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border-2 border-white/20 text-white hover:border-[#F5C518]/40 hover:text-[#F5C518] font-display text-[0.85rem] font-bold uppercase tracking-[0.08em] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#F5C518] text-[#0A0A0A] font-display text-[0.85rem] font-bold uppercase tracking-[0.08em] hover:bg-[#D4A017] transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>

        {/* Popular categories */}
        <div>
          <p className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-[#F5C518] mb-3">
            Browse Popular Trades
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {POPULAR_CATEGORIES.map((cat) => (
              <Link
                key={cat}
                to={`/search?category=${encodeURIComponent(cat)}&sort=rating_desc`}
                className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[#999] text-[0.82rem] font-display font-bold uppercase tracking-[0.06em] hover:border-[#F5C518]/40 hover:text-[#F5C518] transition-colors"
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
