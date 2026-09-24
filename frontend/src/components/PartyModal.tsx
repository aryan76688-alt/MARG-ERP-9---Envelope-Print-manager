import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Building2 } from 'lucide-react';
import { Party } from '../types';

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
        is_active: true,
      });
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
              <label className="block font-bold text-slate-700 mb-1">
                Party Code (Optional)
              </label>
              <input
                type="text"
                value={formData.party_code || ''}
                onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                placeholder="e.g. P0001"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono uppercase"
              />
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

            {/* Delivery Route */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Delivery Route (Optional)
              </label>
              <input
                type="text"
                value={formData.route || ''}
                onChange={(e) => setFormData({ ...formData, route: e.target.value })}
                placeholder="e.g. Route 1, Ring Road, Market"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold uppercase"
              />
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
