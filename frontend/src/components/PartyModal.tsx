import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Building2, Calendar, MapPin } from 'lucide-react';
import { Party } from '../types';
import { fetchNextPartyCode } from '../api/client';

const WEEKDAYS = [
  { en: 'Monday', gu: 'સોમવાર', short: 'Mon' },
  { en: 'Tuesday', gu: 'મંગળવાર', short: 'Tue' },
  { en: 'Wednesday', gu: 'બુધવાર', short: 'Wed' },
  { en: 'Thursday', gu: 'ગુરુવાર', short: 'Thu' },
  { en: 'Friday', gu: 'શુક્રવાર', short: 'Fri' },
  { en: 'Saturday', gu: 'શનિવાર', short: 'Sat' },
  { en: 'Sunday', gu: 'રવિવાર', short: 'Sun' }
];

interface PartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (party: Party) => Promise<void>;
  initialParty?: Party | null;
}

export const PartyModal: React.FC<PartyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialParty,
}) => {
  const [formData, setFormData] = useState<Party>({
    party_name: '',
    party_code: '',
    address: '',
    city: '',
    state: '',
    mobile_no: '',
    landline: '',
    email: '',
    gst_no: '',
    notes: '',
    is_active: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingNextCode, setLoadingNextCode] = useState(false);

  useEffect(() => {
    if (initialParty) {
      setFormData({
        id: initialParty.id,
        party_name: initialParty.party_name || '',
        party_code: initialParty.party_code || '',
        address: initialParty.address || '',
        address_line_2: initialParty.address_line_2 || '',
        address_line_3: initialParty.address_line_3 || '',
        city: initialParty.city || '',
        state: initialParty.state || '',
        mobile_no: initialParty.mobile_no || '',
        landline: initialParty.landline || '',
        email: initialParty.email || '',
        gst_no: initialParty.gst_no || '',
        notes: initialParty.notes || '',
        route: initialParty.route || '',
        route_1: initialParty.route_1 || initialParty.route || '',
        route_2: initialParty.route_2 || '',
        route_3: initialParty.route_3 || '',
        route_1_gu: initialParty.route_1_gu || '',
        route_2_gu: initialParty.route_2_gu || '',
        route_3_gu: initialParty.route_3_gu || '',
        party_name_gu: initialParty.party_name_gu || '',
        address_gu: initialParty.address_gu || '',
        address_line_2_gu: initialParty.address_line_2_gu || '',
        address_line_3_gu: initialParty.address_line_3_gu || '',
        city_gu: initialParty.city_gu || '',
        state_gu: initialParty.state_gu || '',
        is_active: initialParty.is_active ?? true,
      });
    } else {
      setFormData({
        party_name: '',
        party_code: '',
        address: '',
        address_line_2: '',
        address_line_3: '',
        city: '',
        state: '',
        mobile_no: '',
        landline: '',
        email: '',
        gst_no: '',
        notes: '',
        route: '',
        route_1: '',
        route_2: '',
        route_3: '',
        route_1_gu: '',
        route_2_gu: '',
        route_3_gu: '',
        party_name_gu: '',
        address_gu: '',
        address_line_2_gu: '',
        address_line_3_gu: '',
        city_gu: '',
        state_gu: '',
        is_active: true,
      });
      if (isOpen) {
        setLoadingNextCode(true);
        fetchNextPartyCode()
          .then((res) => {
            if (res && res.next_code) {
              setFormData((prev) => ({ ...prev, party_code: res.next_code }));
            }
          })
          .catch(console.error)
          .finally(() => setLoadingNextCode(false));
      }
    }
    setErrors({});
  }, [initialParty, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.party_name.trim()) errs.party_name = 'Party Name is required';
    if (!formData.address.trim()) errs.address = 'Address is required';
    if (!formData.city.trim()) errs.city = 'City is required';
    if (!formData.state.trim()) errs.state = 'State is required';
    if (formData.email && !formData.email.includes('@')) {
      errs.email = 'Please enter a valid email address';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setErrors({ general: err.message || 'Failed to save party' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h3 className="font-extrabold text-base tracking-wide">
              {initialParty ? 'Edit Party Details' : 'Add New Party'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice: PIN code permanently removed */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 text-xs text-blue-900 flex items-center justify-between">
          <span>* PIN Code is permanently removed as per MARG envelope format.</span>
          <span className="font-bold text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded">NO PIN REQUIRED</span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {errors.general && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errors.general}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Party Name */}
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                Party Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.party_name}
                onChange={(e) => setFormData({ ...formData, party_name: e.target.value })}
                placeholder="e.g. JODHPUR MEDICOSE"
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.party_name ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold uppercase`}
              />
              {errors.party_name && <p className="text-red-500 text-[11px] mt-1">{errors.party_name}</p>}
            </div>

            {/* Party Code */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-slate-700">
                  Party Code
                </label>
                {!initialParty && (
                  <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    Auto-Assigned
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={formData.party_code || ''}
                  onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                  placeholder="e.g. MARG000001"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono font-bold uppercase tracking-wide text-slate-900 bg-slate-50/80"
                />
                {loadingNextCode && (
                  <span className="absolute right-2.5 top-2 text-[10px] text-blue-600 font-bold animate-pulse">
                    Generating...
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Format: <span className="font-mono font-bold text-slate-700">MARG000001</span>. Auto-assigned if left blank.
              </p>
            </div>

            {/* GST Number */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                GST Number (Optional)
              </label>
              <input
                type="text"
                value={formData.gst_no || ''}
                onChange={(e) => setFormData({ ...formData, gst_no: e.target.value })}
                placeholder="e.g. 08ABCDE1234F1Z2"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono uppercase"
              />
            </div>

            {/* Address Line 1 */}
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                Address Line 1 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Premises / Shop / Building / Street / Road"
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.address ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs uppercase`}
              />
              {errors.address && <p className="text-red-500 text-[11px] mt-1">{errors.address}</p>}
            </div>

            {/* Address Line 2 */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Address Line 2 (Optional)
              </label>
              <input
                type="text"
                value={formData.address_line_2 || ''}
                onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                placeholder="Area / Colony / Landmark"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs uppercase"
              />
            </div>

            {/* Address Line 3 */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Address Line 3 (Optional)
              </label>
              <input
                type="text"
                value={formData.address_line_3 || ''}
                onChange={(e) => setFormData({ ...formData, address_line_3: e.target.value })}
                placeholder="Near station / Post Office / Extra details"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs uppercase"
              />
            </div>

            {/* City */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="e.g. JODHPUR"
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.city ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold uppercase`}
              />
              {errors.city && <p className="text-red-500 text-[11px] mt-1">{errors.city}</p>}
            </div>

            {/* State */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="e.g. RAJASTHAN"
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.state ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold uppercase`}
              />
              {errors.state && <p className="text-red-500 text-[11px] mt-1">{errors.state}</p>}
            </div>

            {/* Gujarati Address Details Section */}
            <div className="sm:col-span-2 p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs text-purple-900 flex items-center gap-1.5">
                  <span>ગુજરાતી સરનામું અને વિગતો (Gujarati Address & Details)</span>
                </span>
                <span className="text-[10px] text-purple-700 font-semibold bg-purple-100 px-2 py-0.5 rounded">
                  For Gujarati Envelopes
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                    પાર્ટી નામ (Gujarati Party Name)
                  </label>
                  <input
                    type="text"
                    value={formData.party_name_gu || ''}
                    onChange={(e) => setFormData({ ...formData, party_name_gu: e.target.value })}
                    placeholder="દા.ત. જોધપુર મેડિકોઝ"
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-bold bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                    સરનામું લાઇન 1 (Gujarati Address Line 1)
                  </label>
                  <input
                    type="text"
                    value={formData.address_gu || ''}
                    onChange={(e) => setFormData({ ...formData, address_gu: e.target.value })}
                    placeholder="દુકાન નં. / મકાન / શેરી / માર્ગ"
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                    સરનામું લાઇન 2 (Gujarati Address Line 2)
                  </label>
                  <input
                    type="text"
                    value={formData.address_line_2_gu || ''}
                    onChange={(e) => setFormData({ ...formData, address_line_2_gu: e.target.value })}
                    placeholder="વિસ્તાર / લેન્ડમાર્ક (વૈકલ્પિક)"
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                    સરનામું લાઇન 3 (Gujarati Address Line 3)
                  </label>
                  <input
                    type="text"
                    value={formData.address_line_3_gu || ''}
                    onChange={(e) => setFormData({ ...formData, address_line_3_gu: e.target.value })}
                    placeholder="વધારાની વિગત (વૈકલ્પિક)"
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                    શહેર / ગામ (Gujarati City)
                  </label>
                  <input
                    type="text"
                    value={formData.city_gu || ''}
                    onChange={(e) => setFormData({ ...formData, city_gu: e.target.value })}
                    placeholder="દા.ત. જેસલમેર / દહેગામ"
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-bold bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-purple-900 mb-1 text-[11px]">
                    રાજ્ય (Gujarati State)
                  </label>
                  <input
                    type="text"
                    value={formData.state_gu || ''}
                    onChange={(e) => setFormData({ ...formData, state_gu: e.target.value })}
                    placeholder="દા.ત. ગુજરાત / રાજસ્થાન"
                    className="w-full px-3 py-1.5 rounded-lg border border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-bold bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Mobile No. */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                type="text"
                value={formData.mobile_no || ''}
                onChange={(e) => setFormData({ ...formData, mobile_no: e.target.value })}
                placeholder="e.g. 9829012345"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono"
              />
            </div>

            {/* Landline */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Landline Phone
              </label>
              <input
                type="text"
                value={formData.landline || ''}
                onChange={(e) => setFormData({ ...formData, landline: e.target.value })}
                placeholder="e.g. 0291-2645120"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="party@example.com"
                className={`w-full px-3 py-2 rounded-lg border ${
                  errors.email ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs`}
              />
              {errors.email && <p className="text-red-500 text-[11px] mt-1">{errors.email}</p>}
            </div>

            {/* Delivery Route System (Max 3 Routes) */}
            <div className="sm:col-span-2 p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs text-blue-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span>Delivery Route System (Max 3 Routes / Weekdays)</span>
                </span>
                <span className="text-[10px] text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded">
                  Max 3 Routes Allowed
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Route 1 */}
                <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-blue-900 text-[11px]">Primary Route 1 (મુખ્ય)</label>
                    {formData.route_1_gu && (
                      <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                        {formData.route_1_gu}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.route_1 || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const wMatch = WEEKDAYS.find((w) => w.en.toLowerCase() === val.trim().toLowerCase());
                      setFormData({
                        ...formData,
                        route_1: val,
                        route_1_gu: wMatch ? wMatch.gu : formData.route_1_gu,
                        route: val || formData.route_2 || formData.route_3
                      });
                    }}
                    placeholder="e.g. Monday or Dehgam"
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-bold uppercase focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {WEEKDAYS.map((w) => (
                      <button
                        key={w.short}
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          route_1: w.en,
                          route_1_gu: w.gu,
                          route: w.en
                        })}
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          (formData.route_1 || '').toUpperCase() === w.en.toUpperCase()
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title={`${w.en} (${w.gu})`}
                      >
                        {w.short}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Route 2 */}
                <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-purple-900 text-[11px]">Secondary Route 2 (બીજો)</label>
                    {formData.route_2_gu && (
                      <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                        {formData.route_2_gu}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.route_2 || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const wMatch = WEEKDAYS.find((w) => w.en.toLowerCase() === val.trim().toLowerCase());
                      setFormData({
                        ...formData,
                        route_2: val,
                        route_2_gu: wMatch ? wMatch.gu : formData.route_2_gu
                      });
                    }}
                    placeholder="e.g. Thursday or Talod"
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-bold uppercase focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {WEEKDAYS.map((w) => (
                      <button
                        key={w.short}
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          route_2: w.en,
                          route_2_gu: w.gu
                        })}
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          (formData.route_2 || '').toUpperCase() === w.en.toUpperCase()
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title={`${w.en} (${w.gu})`}
                      >
                        {w.short}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Route 3 */}
                <div className="space-y-1.5 bg-white p-2.5 rounded-lg border border-amber-200">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-amber-900 text-[11px]">Third Route 3 (ત્રીજો)</label>
                    {formData.route_3_gu && (
                      <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                        {formData.route_3_gu}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.route_3 || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const wMatch = WEEKDAYS.find((w) => w.en.toLowerCase() === val.trim().toLowerCase());
                      setFormData({
                        ...formData,
                        route_3: val,
                        route_3_gu: wMatch ? wMatch.gu : formData.route_3_gu
                      });
                    }}
                    placeholder="e.g. Saturday or Market"
                    className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs font-bold uppercase focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {WEEKDAYS.map((w) => (
                      <button
                        key={w.short}
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          route_3: w.en,
                          route_3_gu: w.gu
                        })}
                        className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                          (formData.route_3 || '').toUpperCase() === w.en.toUpperCase()
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title={`${w.en} (${w.gu})`}
                      >
                        {w.short}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Status */}
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <label htmlFor="is_active" className="font-bold text-slate-700 cursor-pointer">
                Active Party (Visible in search)
              </label>
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                Notes & Dispatch Instructions
              </label>
              <textarea
                rows={2}
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g. Express delivery, fragile medicine cartons..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Party'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
