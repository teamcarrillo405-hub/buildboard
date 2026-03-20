/**
 * ClaimPage — Full business verification flow.
 *
 * Route: /claim/:companyId
 *
 * Steps:
 *   1. Your Information (name, title, email, phone)
 *   2. Business Details (ownership type, year acquired, employees, license #)
 *   3. Documents (required docs checklist)
 *   4. Review & Payment ($150 Stripe checkout)
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle, FileText, CreditCard, User, Building2 } from 'lucide-react';
import type { Company } from '../api/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  claimerName: string;
  claimerTitle: string;
  claimerEmail: string;
  claimerPhone: string;
  ownershipType: string;
  yearAcquired: string;
  employeeCount: string;
  licenseNumber: string;
  message: string;
  hasPhotoId: boolean;
  hasContractorLicense: boolean;
  hasBusinessProof: boolean;
  hasAddressProof: boolean;
}

const INITIAL_FORM: FormData = {
  claimerName: '', claimerTitle: '', claimerEmail: '', claimerPhone: '',
  ownershipType: '', yearAcquired: '', employeeCount: '', licenseNumber: '', message: '',
  hasPhotoId: false, hasContractorLicense: false, hasBusinessProof: false, hasAddressProof: false,
};

const STEPS = ['Your Info', 'Business Details', 'Documents', 'Payment'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-gray-900 text-sm outline-none focus:border-[#F5C518] focus:ring-2 focus:ring-[#F5C518]/20 transition-colors placeholder-gray-400";
const selectClass = `${inputClass} cursor-pointer`;
const labelClass = "block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5";

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

const StepInfo: React.FC<{ form: FormData; onChange: (k: keyof FormData, v: string) => void }> = ({ form, onChange }) => (
  <div className="space-y-5">
    <p className="text-gray-500 text-sm leading-relaxed">
      Tell us about yourself. We'll use this to contact you during the verification process.
    </p>
    <div>
      <label className={labelClass}>Full Legal Name *</label>
      <input className={inputClass} required placeholder="Jane Smith" value={form.claimerName} onChange={e => onChange('claimerName', e.target.value)} />
    </div>
    <div>
      <label className={labelClass}>Your Title / Role *</label>
      <select className={selectClass} value={form.claimerTitle} onChange={e => onChange('claimerTitle', e.target.value)}>
        <option value="">Select your role…</option>
        <option value="Owner">Owner</option>
        <option value="Co-Owner / Partner">Co-Owner / Partner</option>
        <option value="President / CEO">President / CEO</option>
        <option value="General Manager">General Manager</option>
        <option value="Authorized Representative">Authorized Representative</option>
      </select>
    </div>
    <div>
      <label className={labelClass}>Business Email *</label>
      <input className={inputClass} type="email" required placeholder="you@company.com" value={form.claimerEmail} onChange={e => onChange('claimerEmail', e.target.value)} />
    </div>
    <div>
      <label className={labelClass}>Phone Number *</label>
      <input className={inputClass} type="tel" placeholder="(312) 555-0100" value={form.claimerPhone} onChange={e => onChange('claimerPhone', e.target.value)} />
    </div>
  </div>
);

const StepBusiness: React.FC<{ form: FormData; onChange: (k: keyof FormData, v: string) => void }> = ({ form, onChange }) => (
  <div className="space-y-5">
    <p className="text-gray-500 text-sm leading-relaxed">
      Help us understand your relationship to this business.
    </p>
    <div>
      <label className={labelClass}>How did you acquire this business? *</label>
      <select className={selectClass} value={form.ownershipType} onChange={e => onChange('ownershipType', e.target.value)}>
        <option value="">Select…</option>
        <option value="Founded">I founded it</option>
        <option value="Purchased">I purchased it</option>
        <option value="Inherited">I inherited it</option>
        <option value="Partnership">Partnership / Joint venture</option>
        <option value="Other">Other</option>
      </select>
    </div>
    <div>
      <label className={labelClass}>Year Acquired / Founded *</label>
      <input className={inputClass} placeholder="e.g. 2018" value={form.yearAcquired} onChange={e => onChange('yearAcquired', e.target.value)} />
    </div>
    <div>
      <label className={labelClass}>Number of Employees</label>
      <select className={selectClass} value={form.employeeCount} onChange={e => onChange('employeeCount', e.target.value)}>
        <option value="">Select…</option>
        <option value="1">Just me (sole proprietor)</option>
        <option value="2-5">2–5</option>
        <option value="6-15">6–15</option>
        <option value="16-50">16–50</option>
        <option value="51+">51+</option>
      </select>
    </div>
    <div>
      <label className={labelClass}>State Contractor License Number</label>
      <input className={inputClass} placeholder="e.g. CONT-123456" value={form.licenseNumber} onChange={e => onChange('licenseNumber', e.target.value)} />
    </div>
    <div>
      <label className={labelClass}>Anything else you'd like us to know?</label>
      <textarea className={`${inputClass} resize-none`} rows={3} placeholder="Optional — certifications, special circumstances, etc." value={form.message} onChange={e => onChange('message', e.target.value)} />
    </div>
  </div>
);

const DocRow: React.FC<{
  checked: boolean;
  onToggle: () => void;
  title: string;
  required?: boolean;
  accepted: string;
}> = ({ checked, onToggle, title, required, accepted }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`w-full text-left rounded-lg border p-4 transition-all duration-200 ${
      checked
        ? 'border-[#F5C518] bg-[#F5C518]/5'
        : 'border-gray-200 bg-white hover:border-gray-400'
    }`}
  >
    <div className="flex items-start gap-3">
      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
        checked ? 'border-[#F5C518] bg-[#F5C518]' : 'border-gray-300'
      }`}>
        {checked && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {required && <span className="text-[9px] font-bold uppercase tracking-widest text-[#c9a200] bg-[#F5C518]/15 rounded px-1.5 py-0.5">Required</span>}
        </div>
        <p className="text-xs text-gray-500 mt-1">{accepted}</p>
      </div>
    </div>
  </button>
);

const StepDocuments: React.FC<{ form: FormData; onChange: (k: keyof FormData, v: boolean) => void }> = ({ form, onChange }) => (
  <div className="space-y-4">
    <div className="rounded-lg bg-[#F5C518]/8 border border-[#F5C518]/30 p-4 mb-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#c9a200] mb-1">What happens next</p>
      <p className="text-xs text-gray-600 leading-relaxed">
        After payment, HCC will contact you via email to collect your documents. Verification typically takes <strong className="text-gray-900">2–3 weeks</strong>. Please confirm below which documents you'll be able to provide.
      </p>
    </div>

    <DocRow
      checked={form.hasPhotoId}
      onToggle={() => onChange('hasPhotoId', !form.hasPhotoId)}
      title="Government-Issued Photo ID"
      required
      accepted="Driver's license or passport of the owner / authorized representative"
    />
    <DocRow
      checked={form.hasContractorLicense}
      onToggle={() => onChange('hasContractorLicense', !form.hasContractorLicense)}
      title="State Contractor License"
      required
      accepted="Copy of your current state contractor license (front and back)"
    />
    <DocRow
      checked={form.hasBusinessProof}
      onToggle={() => onChange('hasBusinessProof', !form.hasBusinessProof)}
      title="Business Ownership Proof"
      required
      accepted="One of: Business License, Articles of Incorporation, LLC Operating Agreement, or DBA Certificate"
    />
    <DocRow
      checked={form.hasAddressProof}
      onToggle={() => onChange('hasAddressProof', !form.hasAddressProof)}
      title="Proof of Business Address"
      required
      accepted="Utility bill, business bank statement, or insurance certificate — dated within 90 days"
    />

    {(!form.hasPhotoId || !form.hasContractorLicense || !form.hasBusinessProof || !form.hasAddressProof) && (
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 mt-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">All four documents are required for verification. Please confirm you have access to each one before proceeding.</p>
      </div>
    )}
  </div>
);

const StepPayment: React.FC<{ company: Company | null; form: FormData }> = ({ company, form }) => (
  <div className="space-y-5">
    <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">Claiming</p>
        <p className="text-gray-900 font-bold text-lg">{company?.businessName}</p>
        <p className="text-gray-500 text-xs">{[company?.city, company?.state].filter(Boolean).join(', ')}</p>
      </div>
      <div className="px-5 py-4 space-y-2.5">
        {[
          ['Name', form.claimerName],
          ['Title', form.claimerTitle],
          ['Email', form.claimerEmail],
          ['Phone', form.claimerPhone],
          ['Ownership', form.ownershipType],
          ['Year Acquired', form.yearAcquired],
          ['License #', form.licenseNumber],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-gray-400 font-medium">{label}</span>
            <span className="text-gray-700 font-semibold">{value}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="rounded-lg border-2 border-[#F5C518] bg-[#F5C518]/5 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-900 font-bold text-base">HCC Business Verification</span>
        <span className="text-gray-900 font-black text-2xl">$150</span>
      </div>
      <ul className="space-y-2">
        {[
          'Manual document review by HCC staff',
          'Identity and license verification',
          'HCC Verified badge on your profile',
          'Priority placement in search results',
          'Estimated 2–3 weeks to complete',
        ].map(item => (
          <li key={item} className="flex items-center gap-2 text-xs text-gray-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#c9a200] flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>

    <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
      <Shield className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-gray-500 leading-relaxed">
        Payment is processed securely by Stripe. After payment, HCC will email you within 2 business days to collect your documents. The fee is non-refundable if verification is denied due to fraudulent information.
      </p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

const SuccessScreen: React.FC<{ company: Company | null }> = ({ company }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <div className="max-w-md w-full text-center">
      <div className="w-20 h-20 rounded-full bg-[#F5C518]/15 border-2 border-[#F5C518] flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-10 h-10 text-[#c9a200]" />
      </div>
      <h1 className="font-display text-3xl font-black text-gray-900 mb-3">Payment Received!</h1>
      <p className="text-gray-600 text-base mb-2">
        Your verification request for <span className="text-gray-900 font-semibold">{company?.businessName}</span> has been submitted.
      </p>
      <p className="text-gray-500 text-sm mb-8 leading-relaxed">
        HCC will email you at the address you provided within <strong className="text-gray-700">2 business days</strong> to collect your documents. Verification typically completes within <strong className="text-gray-700">2–3 weeks</strong>.
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-5 text-left space-y-2.5 mb-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-[#c9a200] mb-3">Documents to prepare</p>
        {[
          'Government-issued photo ID',
          'State contractor license',
          'Business ownership proof (License, Articles of Inc., LLC Agreement, or DBA)',
          'Proof of business address (utility bill or bank statement, within 90 days)',
        ].map(doc => (
          <div key={doc} className="flex items-start gap-2 text-xs text-gray-600">
            <FileText className="w-3.5 h-3.5 text-[#c9a200] flex-shrink-0 mt-0.5" />
            {doc}
          </div>
        ))}
      </div>
      <a href={company ? `/company/${company.id}` : '/'} className="inline-block px-6 py-3 rounded-lg bg-[#F5C518] text-black font-display font-bold text-sm uppercase tracking-widest hover:bg-[#D4A017] transition-colors">
        Return to Profile
      </a>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main ClaimPage
// ---------------------------------------------------------------------------

const ClaimPage: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [company, setCompany] = useState<Company | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuccess = searchParams.get('session_id') !== null;
  const wasCancelled = searchParams.get('cancelled') === '1';

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/companies/${companyId}`)
      .then(r => r.json())
      .then(data => { setCompany(data); setLoadingCompany(false); })
      .catch(() => setLoadingCompany(false));
  }, [companyId]);

  const update = (key: keyof FormData, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const canAdvance = () => {
    if (step === 0) return form.claimerName.trim() && form.claimerTitle && form.claimerEmail.trim() && form.claimerPhone.trim();
    if (step === 1) return form.ownershipType && form.yearAcquired.trim();
    if (step === 2) return form.hasPhotoId && form.hasContractorLicense && form.hasBusinessProof && form.hasAddressProof;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const docsProvided = [
        form.hasPhotoId && 'photo_id',
        form.hasContractorLicense && 'contractor_license',
        form.hasBusinessProof && 'business_proof',
        form.hasAddressProof && 'address_proof',
      ].filter(Boolean).join(',');

      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          claimerName: form.claimerName,
          claimerEmail: form.claimerEmail,
          claimerPhone: form.claimerPhone,
          claimerTitle: form.claimerTitle,
          ownershipType: form.ownershipType,
          yearAcquired: form.yearAcquired,
          employeeCount: form.employeeCount,
          licenseNumber: form.licenseNumber,
          message: form.message,
          documentsProvided: docsProvided,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        navigate(`/claim/${companyId}/success`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  if (isSuccess) return <SuccessScreen company={company} />;

  if (loadingCompany) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stepIcons = [User, Building2, FileText, CreditCard];
  const StepIcon = stepIcons[step];

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 transition-colors p-1">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#F5C518]" />
            <span className="font-display text-sm font-bold uppercase tracking-widest text-gray-700">
              Claim Business
            </span>
          </div>
        </div>

        {/* Company name */}
        {company && (
          <div className="mb-6">
            <p className="text-gray-400 text-xs mb-1 uppercase tracking-widest font-semibold">Claiming</p>
            <h1 className="font-display text-2xl font-black text-gray-900">{company.businessName}</h1>
            {(company.city || company.state) && (
              <p className="text-gray-500 text-sm">{[company.city, company.state].filter(Boolean).join(', ')}</p>
            )}
          </div>
        )}

        {/* Cancelled warning */}
        {wasCancelled && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 mb-5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">Payment was cancelled. Your form data is saved — you can review and try again.</p>
          </div>
        )}

        {/* Step progress */}
        <div className="flex items-center mb-8">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step ? 'bg-[#F5C518] text-black' :
                  i === step ? 'bg-white border-2 border-[#F5C518] text-[#c9a200]' :
                  'bg-white border border-gray-300 text-gray-400'
                }`}>
                  {i < step ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : i + 1}
                </div>
                <span className={`text-[9px] font-bold uppercase tracking-wider mt-1.5 ${i === step ? 'text-[#c9a200]' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 mb-4 transition-all ${i < step ? 'bg-[#F5C518]' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Card header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-[#F5C518]/15 flex items-center justify-center flex-shrink-0">
              <StepIcon className="text-[#c9a200]" size={18} />
            </div>
            <div>
              <p className="text-gray-900 font-bold text-base">{STEPS[step]}</p>
              <p className="text-gray-400 text-[11px]">Step {step + 1} of {STEPS.length}</p>
            </div>
          </div>

          {/* Card body */}
          <div className="px-6 py-6">
            {step === 0 && <StepInfo form={form} onChange={(k, v) => update(k, v as string)} />}
            {step === 1 && <StepBusiness form={form} onChange={(k, v) => update(k, v as string)} />}
            {step === 2 && <StepDocuments form={form} onChange={(k, v) => update(k, v as boolean)} />}
            {step === 3 && <StepPayment company={company} form={form} />}
          </div>

          {/* Card footer */}
          <div className="px-6 pb-6">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className={`flex gap-3 ${step > 0 ? 'justify-between' : 'justify-end'}`}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-lg border border-gray-300 text-gray-600 text-sm hover:border-gray-500 hover:text-gray-900 transition-colors font-semibold"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canAdvance()}
                  className="flex items-center gap-1.5 px-6 py-3 rounded-lg bg-[#F5C518] text-black font-display font-bold text-sm uppercase tracking-widest hover:bg-[#D4A017] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#F5C518] text-black font-display font-bold text-sm uppercase tracking-widest hover:bg-[#D4A017] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Pay $150 &amp; Submit
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fine print */}
        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          Payment processed securely by Stripe. Verification takes 2–3 weeks.<br />
          Questions? Email <a href="mailto:info@hispanicconstructioncouncil.com" className="text-gray-500 hover:text-gray-700 underline transition-colors">info@hispanicconstructioncouncil.com</a>
        </p>
      </div>
    </div>
  );
};

export default ClaimPage;
