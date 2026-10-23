import React, { useState, useMemo } from 'react';
import {
  Banknote,
  RotateCcw,
  Copy,
  Check,
  Share2,
  Coins,
  ArrowRight,
} from 'lucide-react';

const DENOMINATIONS = [
  { value: 2000, label: '₹2,000', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  { value: 500, label: '₹500', color: 'bg-stone-100 text-stone-800 border-stone-300' },
  { value: 200, label: '₹200', color: 'bg-amber-50 text-amber-800 border-amber-300' },
  { value: 100, label: '₹100', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { value: 50, label: '₹50', color: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
  { value: 20, label: '₹20', color: 'bg-red-50 text-red-800 border-red-200' },
  { value: 10, label: '₹10', color: 'bg-orange-50 text-orange-800 border-orange-200' },
  { value: 5, label: '₹5', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { value: 2, label: '₹2', color: 'bg-slate-100 text-slate-800 border-slate-200' },
  { value: 1, label: '₹1', color: 'bg-slate-100 text-slate-800 border-slate-200' },
];

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val || 0);
}

function numberToIndianWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';
  if (num < 0) return 'Minus ' + numberToIndianWords(Math.abs(num));

  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ',
    'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
  }

  function convertThreeDigits(n: number): string {
    let str = '';
    if (n >= 100) {
      str += a[Math.floor(n / 100)] + 'Hundred ';
      n %= 100;
    }
    if (n > 0) {
      str += convertTwoDigits(n);
    }
    return str;
  }

  const crores = Math.floor(num / 10000000);
  num %= 10000000;
  const lakhs = Math.floor(num / 100000);
  num %= 100000;
  const thousands = Math.floor(num / 1000);
  num %= 1000;
  const hundreds = num;

  let result = '';
  if (crores > 0) result += convertThreeDigits(crores) + 'Crore ';
  if (lakhs > 0) result += convertThreeDigits(lakhs) + 'Lakh ';
  if (thousands > 0) result += convertThreeDigits(thousands) + 'Thousand ';
  if (hundreds > 0) result += convertThreeDigits(hundreds);

  return result.trim() + ' Rupees Only';
}

interface NoteCalculatorProps {
  onApplyTotal?: (totalAmount: number) => void;
  title?: string;
  className?: string;
}

export const NoteCalculator: React.FC<NoteCalculatorProps> = ({
  onApplyTotal,
  title = 'Cash Note Calculator (રોકડ ગણતરી)',
  className = '',
}) => {
  const [counts, setCounts] = useState<Record<number, number>>({
    2000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  });
  const [coinsAmount, setCoinsAmount] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const handleCountChange = (denom: number, val: string | number) => {
    const parsed = Math.max(0, parseInt(String(val) || '0', 10));
    setCounts((prev) => ({ ...prev, [denom]: isNaN(parsed) ? 0 : parsed }));
  };

  const handleQuickAdd = (denom: number, delta: number) => {
    setCounts((prev) => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
  };

  const resetAll = () => {
    setCounts({
      2000: 0,
      500: 0,
      200: 0,
      100: 0,
      50: 0,
      20: 0,
      10: 0,
      5: 0,
      2: 0,
      1: 0,
    });
    setCoinsAmount(0);
  };

  const totalCalculations = useMemo(() => {
    let totalNotes = 0;
    let notesAmount = 0;

    for (const d of DENOMINATIONS) {
      const c = counts[d.value] || 0;
      totalNotes += c;
      notesAmount += c * d.value;
    }

    const grandTotal = notesAmount + (Number(coinsAmount) || 0);

    return {
      totalNotes,
      notesAmount,
      grandTotal,
      words: numberToIndianWords(grandTotal),
    };
  }, [counts, coinsAmount]);

  const generateBreakdownText = () => {
    const lines = ['💵 SHREEJI HEALTHCARE - CASH NOTE TALLY', '--------------------------------------'];
    for (const d of DENOMINATIONS) {
      const c = counts[d.value] || 0;
      if (c > 0) {
        lines.push(`${d.label} × ${c} = ${formatCurrency(c * d.value)}`);
      }
    }
    if (coinsAmount > 0) {
      lines.push(`Coins / છૂટા સિક્કા: ${formatCurrency(coinsAmount)}`);
    }
    lines.push('--------------------------------------');
    lines.push(`Total Notes (નોટોની સંખ્યા): ${totalCalculations.totalNotes}`);
    lines.push(`Grand Total (કુલ રકમ): ${formatCurrency(totalCalculations.grandTotal)}`);
    lines.push(`In Words: ${totalCalculations.words}`);
    lines.push(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    return lines.join('\n');
  };

  const handleCopy = () => {
    const text = generateBreakdownText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    const text = generateBreakdownText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className={`border border-slate-200 shadow-md bg-white rounded-2xl overflow-hidden max-w-4xl mx-auto ${className}`}>
      <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-slate-800 text-white p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-md">
              <Banknote className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                {title}
              </h3>
              <p className="text-xs text-emerald-100 font-medium">
                High-speed Indian currency denomination calculator & cash tally
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={resetAll}
              className="text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 px-2.5 rounded-lg flex items-center font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Clear
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs bg-white text-slate-800 hover:bg-slate-100 h-8 px-2.5 rounded-lg font-bold shadow-xs flex items-center"
            >
              {copied ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="text-xs bg-emerald-500 hover:bg-emerald-400 text-white h-8 px-2.5 rounded-lg font-bold shadow-xs flex items-center"
            >
              <Share2 className="w-3.5 h-3.5 mr-1" /> WhatsApp
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {/* Grand Total Hero Banner */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold block">
              Total Cash Count (કુલ રોકડ રકમ)
            </span>
            <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {formatCurrency(totalCalculations.grandTotal)}
            </div>
            <p className="text-xs text-slate-300 font-medium italic mt-1 line-clamp-2">
              {totalCalculations.words}
            </p>
          </div>

          <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-700 pt-3 md:pt-0 md:pl-6">
            <div className="text-center md:text-right">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 block font-semibold">Total Notes</span>
              <span className="text-2xl font-black text-amber-400">{totalCalculations.totalNotes}</span>
            </div>

            {onApplyTotal && (
              <button
                type="button"
                onClick={() => onApplyTotal(totalCalculations.grandTotal)}
                disabled={totalCalculations.grandTotal <= 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md flex items-center disabled:opacity-50"
              >
                Apply to Slip <ArrowRight className="w-4 h-4 ml-1.5" />
              </button>
            )}
          </div>
        </div>

        {/* Denomination Input Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-bold text-xs text-slate-700 flex items-center justify-between">
            <span>Denomination (નોટ)</span>
            <span className="hidden sm:inline">Quick Adjust</span>
            <span>Pieces (સંખ્યા)</span>
            <span className="text-right">Subtotal (રકમ)</span>
          </div>

          <div className="divide-y divide-slate-100 bg-white text-xs">
            {DENOMINATIONS.map((d) => {
              const count = counts[d.value] || 0;
              const subtotal = count * d.value;

              return (
                <div
                  key={d.value}
                  className={`p-3 sm:px-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors ${
                    count > 0 ? 'bg-emerald-50/20' : ''
                  }`}
                >
                  {/* Denomination Badge */}
                  <div className="w-24 sm:w-28 shrink-0 flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-black text-xs border tracking-wide shadow-2xs ${d.color}`}
                    >
                      {d.label}
                    </span>
                  </div>

                  {/* Quick Adjust Buttons */}
                  <div className="hidden sm:flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(d.value, -1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(d.value, 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition-colors"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(d.value, 5)}
                      className="px-2 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center transition-colors"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(d.value, 10)}
                      className="px-2 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center justify-center transition-colors border border-emerald-200"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(d.value, 50)}
                      className="px-2 h-7 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-[11px] flex items-center justify-center transition-colors"
                    >
                      +50
                    </button>
                  </div>

                  {/* Count Input */}
                  <div className="w-24 sm:w-28 flex items-center gap-1">
                    <span className="text-slate-400 font-mono">×</span>
                    <input
                      type="number"
                      min="0"
                      value={count === 0 ? '' : count}
                      placeholder="0"
                      onChange={(e) => handleCountChange(d.value, e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  {/* Subtotal */}
                  <div className="w-28 sm:w-36 text-right font-black text-sm text-slate-800 shrink-0 font-mono">
                    {subtotal > 0 ? (
                      <span className="text-emerald-700">{formatCurrency(subtotal)}</span>
                    ) : (
                      <span className="text-slate-300">₹0</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Coins Row */}
            <div className="p-3 sm:px-4 flex items-center justify-between gap-3 bg-amber-50/30">
              <div className="w-24 sm:w-28 shrink-0 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg font-black text-xs border border-amber-300 bg-amber-100 text-amber-900 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-700" /> Coins
                </span>
              </div>

              <div className="hidden sm:block text-[11px] text-slate-500 font-medium">
                Loose coins / છૂટા સિક્કા
              </div>

              <div className="w-24 sm:w-28 flex items-center gap-1">
                <span className="text-slate-400 font-mono">₹</span>
                <input
                  type="number"
                  min="0"
                  value={coinsAmount === 0 ? '' : coinsAmount}
                  placeholder="0"
                  onChange={(e) => setCoinsAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-center font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="w-28 sm:w-36 text-right font-black text-sm text-emerald-700 shrink-0 font-mono">
                {coinsAmount > 0 ? formatCurrency(coinsAmount) : <span className="text-slate-300">₹0</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
