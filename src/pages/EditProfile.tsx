/**
 * EditProfile Page
 * Allows verified businesses to edit their directory profile,
 * manage portfolio photos, and upload videos.
 * Route: /company/:id/edit
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Lock,
  X,
  Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ProfileAPI, CompanyAPI } from '../api/api';
import type { Company, MediaRecord } from '../api/types';
import MediaUploader from '../components/MediaUploader';
import MediaGallery from '../components/MediaGallery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputClass =
  'w-full bg-background border border-border rounded px-3 py-2 text-white placeholder-text-muted focus:border-brand-primary focus:outline-none transition-colors';
const labelClass = 'block text-sm text-text-muted mb-1';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <div className="bg-surface rounded-lg p-6 border border-border">
    <h2 className="font-display text-lg uppercase tracking-wider text-white mb-4">{title}</h2>
    {children}
  </div>
);

// Toggle switch — styled checkbox
interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <div className="relative">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <div
        className={[
          'relative w-11 h-6 rounded-full transition-colors',
          checked ? 'bg-brand-primary' : 'bg-border',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 bg-white rounded-full w-5 h-5 transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </div>
    </div>
    <span className="text-sm text-white">{label}</span>
  </label>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EditProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();

  // Page-level loading / error
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Company data
  const [company, setCompany] = useState<Company | null>(null);

  // Form fields — contact info
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Form fields — services
  const [services, setServices] = useState<string[]>([]);
  const [newService, setNewService] = useState('');

  // Form fields — business details
  const [warranty, setWarranty] = useState('');
  const [emergencyService, setEmergencyService] = useState(false);
  const [freeEstimate, setFreeEstimate] = useState(false);

  // Media
  const [media, setMedia] = useState<MediaRecord[]>([]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load data on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;

    setPageLoading(true);
    setPageError(null);

    const loadAll = async () => {
      try {
        const data = await CompanyAPI.getById(id);

        if (!data) {
          setPageError('Company not found.');
          return;
        }

        if (data.verificationStatus === 'unverified') {
          setAccessDenied(true);
          setCompany(data);
          return;
        }

        setCompany(data);

        // Populate form
        setPhone(data.phone ?? '');
        setEmail(data.email ?? '');
        setWebsite(data.website ?? '');
        setAddress(data.address ?? '');
        setZipCode(data.zipCode ?? '');
        setServices(Array.isArray(data.services) ? data.services : []);
        setWarranty(data.warranty ?? '');
        setEmergencyService(data.emergencyService ?? false);
        setFreeEstimate(data.freeEstimate ?? false);

        // Fetch media separately (non-blocking for form)
        ProfileAPI.getMedia(id)
          .then(setMedia)
          .catch(() => setMedia([]));
      } catch {
        setPageError('Failed to load company data.');
      } finally {
        setPageLoading(false);
      }
    };

    void loadAll();
  }, [id]);

  // ---------------------------------------------------------------------------
  // Services editor
  // ---------------------------------------------------------------------------
  const handleAddService = useCallback(() => {
    const trimmed = newService.trim();
    if (trimmed && !services.includes(trimmed)) {
      setServices((prev) => [...prev, trimmed]);
    }
    setNewService('');
  }, [newService, services]);

  const handleServiceKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddService();
      }
    },
    [handleAddService],
  );

  const handleRemoveService = useCallback((service: string) => {
    setServices((prev) => prev.filter((s) => s !== service));
  }, []);

  // ---------------------------------------------------------------------------
  // Media handlers
  // ---------------------------------------------------------------------------
  const handleMediaUpload = useCallback((record: MediaRecord) => {
    setMedia((prev) => [...prev, record]);
  }, []);

  const handleDeleteMedia = useCallback(
    async (mediaId: string) => {
      if (!id) return;
      try {
        await ProfileAPI.deleteMedia(id, mediaId);
        setMedia((prev) => prev.filter((m) => m.id !== mediaId));
      } catch {
        // Silent fail — the item stays in the list
      }
    },
    [id],
  );

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setSaveError(null);

    try {
      const data: Record<string, unknown> = {
        phone,
        email,
        website,
        address,
        zipCode,
        services,
        warranty,
        emergencyService,
        freeEstimate,
      };
      await ProfileAPI.update(id, data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setSaveError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [id, phone, email, website, address, zipCode, services, warranty, emergencyService, freeEstimate]);

  const photos = media.filter((m) => m.type === 'photo');
  const videos = media.filter((m) => m.type === 'video');

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <Lock className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Sign In Required</h1>
          <p className="text-text-muted mb-6">
            You must be signed in to edit a business profile.
          </p>
          <Link to={`/company/${id ?? ''}`} className="text-brand-gold hover:text-brand-gold-hover">
            &larr; Back to Profile
          </Link>
        </div>
      </div>
    );
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div role="status" aria-label="Loading" className="w-10 h-10 border-3 border-brand-gold border-t-transparent rounded-full animate-spin">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Error</h1>
          <p className="text-text-muted mb-6">{pageError}</p>
          <Link to="/" className="text-brand-gold hover:text-brand-gold-hover">
            &larr; Back to Directory
          </Link>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <Lock className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Verification Required</h1>
          <p className="text-text-muted mb-6">
            Only verified businesses can edit their profiles. Contact HCC to get verified.
          </p>
          <Link
            to={`/company/${id ?? ''}`}
            className="text-brand-gold hover:text-brand-gold-hover"
          >
            &larr; Back to Profile
          </Link>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main edit form
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen pb-24">
      {/* Page header */}
      <div className="bg-surface border-b border-border sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-[4%] py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to={`/company/${id ?? ''}`}
              className="flex items-center gap-2 text-text-muted hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Profile
            </Link>
            <div className="w-px h-5 bg-border" />
            <div>
              <h1 className="font-display text-base uppercase tracking-wider text-white leading-none">
                Edit Profile
              </h1>
              {company && (
                <p className="text-text-muted text-xs mt-0.5">{company.businessName}</p>
              )}
            </div>
          </div>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white font-display font-bold uppercase tracking-wider rounded hover:bg-brand-primary-hover disabled:opacity-50 transition-colors text-sm"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Form body */}
      <div className="max-w-4xl mx-auto px-[4%] py-8 space-y-8">
        {/* Save error banner */}
        {saveError && (
          <div role="alert" aria-live="polite" className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {saveError}
          </div>
        )}

        {/* 1. Contact Info */}
        <Section title="Contact Info">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-phone" className={labelClass}>Phone</label>
              <input
                id="edit-phone"
                type="tel"
                className={inputClass}
                placeholder="(555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-email" className={labelClass}>Email</label>
              <input
                id="edit-email"
                type="email"
                className={inputClass}
                placeholder="contact@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-website" className={labelClass}>Website</label>
              <input
                id="edit-website"
                type="url"
                className={inputClass}
                placeholder="https://yourwebsite.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="edit-zipcode" className={labelClass}>ZIP Code</label>
              <input
                id="edit-zipcode"
                type="text"
                className={inputClass}
                placeholder="12345"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="edit-address" className={labelClass}>Address</label>
              <input
                id="edit-address"
                type="text"
                className={inputClass}
                placeholder="123 Main St, City, ST"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
        </Section>

        {/* 2. Services */}
        <Section title="Services">
          {/* Tag chips */}
          {services.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {services.map((svc) => (
                <span
                  key={svc}
                  className="inline-flex items-center gap-1 bg-brand-primary/15 border border-brand-primary/30 text-brand-primary rounded-full px-3 py-1 text-sm"
                >
                  {svc}
                  <button
                    onClick={() => handleRemoveService(svc)}
                    className="hover:text-white transition-colors ml-0.5"
                    aria-label={`Remove ${svc}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add service input */}
          <div className="flex gap-2">
            <input
              id="edit-service-input"
              type="text"
              className={inputClass}
              placeholder="Add a service (e.g. Roof Inspection)"
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              onKeyDown={handleServiceKeyDown}
            />
            <button
              onClick={handleAddService}
              className="flex items-center gap-1 px-4 py-2 bg-brand-primary text-white rounded hover:bg-brand-primary-hover transition-colors text-sm font-medium flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </Section>

        {/* 3. Business Details */}
        <Section title="Business Details">
          <div className="space-y-5">
            <div>
              <label htmlFor="edit-warranty" className={labelClass}>Warranty</label>
              <input
                id="edit-warranty"
                type="text"
                className={inputClass}
                placeholder="e.g. 1 year labor warranty"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
              />
            </div>
            <fieldset>
              <legend className="sr-only">Business service options</legend>
              <div className="space-y-5">
                <Toggle
                  checked={emergencyService}
                  onChange={setEmergencyService}
                  label="24/7 Emergency Service Available"
                />
                <Toggle
                  checked={freeEstimate}
                  onChange={setFreeEstimate}
                  label="Free Estimates Offered"
                />
              </div>
            </fieldset>
          </div>
        </Section>

        {/* 4. Portfolio Photos */}
        <Section title="Portfolio Photos">
          <p className="text-text-muted text-sm mb-4">
            {photos.length} / 20 photos
          </p>
          <MediaGallery
            media={photos}
            onDelete={(mediaId) => void handleDeleteMedia(mediaId)}
            editable
          />
          {photos.length < 20 && (
            <div className="mt-4">
              <MediaUploader
                companyId={id ?? ''}
                type="photo"
                onUpload={handleMediaUpload}
                maxSize={10485760}
                accept={['image/jpeg', 'image/png', 'image/webp']}
              />
            </div>
          )}
        </Section>

        {/* 5. Videos */}
        <Section title="Videos">
          <p className="text-text-muted text-sm mb-4">
            {videos.length} / 5 videos
          </p>
          <MediaGallery
            media={videos}
            onDelete={(mediaId) => void handleDeleteMedia(mediaId)}
            editable
          />
          {videos.length < 5 && (
            <div className="mt-4">
              <MediaUploader
                companyId={id ?? ''}
                type="video"
                onUpload={handleMediaUpload}
                maxSize={104857600}
                accept={['video/mp4', 'video/webm']}
              />
            </div>
          )}
        </Section>
      </div>

      {/* Success toast */}
      {saveSuccess && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-3 rounded-lg flex items-center gap-2 shadow-lg z-50 animate-fade-in">
          <CheckCircle className="w-5 h-5" />
          Profile updated successfully
        </div>
      )}
    </div>
  );
};

export default EditProfile;
