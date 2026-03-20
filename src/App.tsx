/**
 * BuildBoard App
 * Main application with routing
 */

import React, { useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext';
import { GuidedSearchProvider } from './contexts/GuidedSearchContext';
import MainLayout from './layouts/MainLayout';
import Home from './pages/Home';
import CompanyProfile from './pages/CompanyProfile';
import SearchResults from './pages/SearchResults';
import NotFound from './pages/NotFound';
import ClaimPage from './pages/ClaimPage';

const Admin = React.lazy(() => import('./pages/Admin'));
const EditProfile = React.lazy(() => import('./pages/EditProfile'));

import './index.css';

const AppContent: React.FC = () => {
  const navigate = useNavigate();

  const handleSearch = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  return (
    <GuidedSearchProvider>
      <Routes>
        {/* Claim flow — full-screen, no nav/footer */}
        <Route path="/claim/:companyId" element={<ClaimPage />} />
        <Route path="/claim/:companyId/success" element={<ClaimPage />} />

        {/* Main app — wrapped in nav/footer layout */}
        <Route path="*" element={
          <MainLayout onSearch={handleSearch}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="/company/:id" element={<CompanyProfile />} />
              <Route
                path="/company/:id/edit"
                element={
                  <React.Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div role="status" aria-label="Loading" className="w-10 h-10 border-3 border-brand-gold border-t-transparent rounded-full animate-spin">
                          <span className="sr-only">Loading...</span>
                        </div>
                      </div>
                    }
                  >
                    <EditProfile />
                  </React.Suspense>
                }
              />
              <Route
                path="/admin"
                element={
                  <React.Suspense
                    fallback={
                      <div className="min-h-screen flex items-center justify-center">
                        <div role="status" aria-label="Loading" className="w-10 h-10 border-3 border-brand-gold border-t-transparent rounded-full animate-spin">
                          <span className="sr-only">Loading...</span>
                        </div>
                      </div>
                    }
                  >
                    <Admin />
                  </React.Suspense>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MainLayout>
        } />
      </Routes>
    </GuidedSearchProvider>
  );
};

const App: React.FC = () => (
  <Router>
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  </Router>
);

export default App;
