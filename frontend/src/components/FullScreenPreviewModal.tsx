import React, { useState } from 'react';
import { ArrowLeft, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight, Printer, Download, X } from 'lucide-react';
import { Party, SenderSettings, AppSettings, CaseItem, CaseBreakdownItem } from '../types';
import { EnvelopeTemplate } from '../print/EnvelopeTemplate';

interface FullScreenPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Partial<Party>;
  sender: SenderSettings;
  cases: CaseItem[];
  caseBreakdown?: CaseBreakdownItem[];
  parcelType: string;
  settings: Partial<AppSettings>;
  onPrint: () => void;
  onDownloadPdf: () => void;
  templateFormat?: 'attachment_pdf' | 'marg_grid_22';
  language?: 'en' | 'gu';
}

export const FullScreenPreviewModal: React.FC<FullScreenPreviewModalProps> = ({
  isOpen,
  onClose,
  party,
  sender,
  cases,
  caseBreakdown,
  parcelType,
  settings,
  onPrint,
  onDownloadPdf,
  templateFormat = 'attachment_pdf',
  language = 'en',
}) => {
  const [currentCaseIndex, setCurrentCaseIndex] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(1.15);

  if (!isOpen) return null;

  const currentCase = cases[currentCaseIndex] || {
    case_number: 1,
    case_total: 1,
    weight: 1.0,
    barcode_value: 'MRG-2026-000001-C1',
  };

  const handlePrev = () => {
    setCurrentCaseIndex((prev) => (prev > 0 ? prev - 1 : cases.length - 1));
  };

  const handleNext = () => {
    setCurrentCaseIndex((prev) => (prev < cases.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-sm select-none">
      {/* Top Toolbar */}
      <header className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="h-6 w-px bg-slate-800" />
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <span>Envelope Full-Screen Preview</span>
            <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded font-mono">
              Case {currentCaseIndex + 1} of {cases.length}
            </span>
          </h2>
        </div>

        {/* Zoom & Fit Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
            <button
              onClick={() => setZoomScale((prev) => Math.max(0.6, prev - 0.15))}
              className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold px-2 text-slate-300">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((prev) => Math.min(2.0, prev + 0.15))}
              className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomScale(1.0)}
              className="px-2 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700 rounded ml-1"
            >
              100%
            </button>
            <button
              onClick={() => setZoomScale(1.15)}
              className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-slate-700"
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Action buttons */}
          <button
            onClick={onPrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/30"
          >
            <Printer className="w-4 h-4" />
            <span>Print Envelope</span>
          </button>
          <button
            onClick={onDownloadPdf}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30"
          >
            <Download className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Preview Center Area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto relative">
        {/* Left Arrow */}
        {cases.length > 1 && (
          <button
            onClick={handlePrev}
            className="absolute left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center shadow-2xl border border-slate-700 transition-all hover:scale-110"
            title="Previous Case"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Envelope Container */}
        <div className="flex items-center justify-center transition-all duration-150">
          <EnvelopeTemplate
            party={party}
            sender={sender}
            caseItem={currentCase}
            caseBreakdown={caseBreakdown}
            parcelType={parcelType}
            settings={settings}
            scale={zoomScale}
            templateFormat={templateFormat}
            language={language}
            className="shadow-2xl border-4 border-slate-900 ring-1 ring-slate-700"
          />
        </div>

        {/* Right Arrow */}
        {cases.length > 1 && (
          <button
            onClick={handleNext}
            className="absolute right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white flex items-center justify-center shadow-2xl border border-slate-700 transition-all hover:scale-110"
            title="Next Case"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Bar with Case Buttons */}
      {cases.length > 1 && (
        <footer className="h-14 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-2 px-6">
          <span className="text-xs text-slate-400 font-medium mr-2">Jump to Case:</span>
          {cases.map((c, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentCaseIndex(idx)}
              className={`px-3 py-1 text-xs font-bold rounded ${
                currentCaseIndex === idx
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Case {c.case_number} ({c.weight.toFixed(2)} KG)
            </button>
          ))}
        </footer>
      )}
    </div>
  );
};
