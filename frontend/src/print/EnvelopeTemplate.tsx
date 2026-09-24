import React from 'react';
import { Party, SenderSettings, AppSettings, CaseItem, CaseBreakdownItem } from '../types';

interface EnvelopeTemplateProps {
  party: Partial<Party>;
  sender: SenderSettings;
  caseItem: CaseItem;
  caseBreakdown?: CaseBreakdownItem[];
  parcelType?: string;
  settings?: Partial<AppSettings>;
  scale?: number;
  className?: string;
  isPrintMode?: boolean;
}

export const EnvelopeTemplate: React.FC<EnvelopeTemplateProps> = ({
  party,
  sender,
  caseItem,
  caseBreakdown,
  settings,
  scale = 1,
  className = '',
  isPrintMode = false,
}) => {
  const showCaseNumber = settings?.show_case_number ?? true;

  const partyName = (party.party_name || 'JODHPUR MEDICOSE').toUpperCase();
  const address = (party.address || 'SHREE MOHANGADH , JAISALMER').toUpperCase();
  const addressLine2 = (party.address_line_2 || '').toUpperCase();
  const addressLine3 = (party.address_line_3 || '').toUpperCase();
  const city = (party.city || 'JAISALMER').toUpperCase();
  const state = (party.state || 'RAJASTHAN').toUpperCase();
  const mobile = party.mobile_no || '+91 8963003012';
  const notes = (party.notes || '').toUpperCase();

  const senderName = (sender.business_name || 'SHREEJI HEALTHCARE-HEALTHCARE').toUpperCase();
  const senderAddr = (sender.address || 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305').toUpperCase();
  const senderMobile = sender.mobile || '+91 99245 44283';
  const senderEmail = (sender.email || 'SHREEJISEVEN@GMAIL.COM').toUpperCase();

  const toHeader = city ? `TO - ${city}` : 'TO -';

  // Split sender address into 2 rows matching reference envelope
  let senderAddr1 = senderAddr;
  let senderAddr2 = '';
  if (senderAddr.includes('DEHGAM-MODASA ROAD')) {
    senderAddr1 = 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD,';
    senderAddr2 = 'DEHGAM-382305.';
  } else if (senderAddr.includes(',')) {
    const parts = senderAddr.split(',').map((p) => p.trim());
    const mid = Math.max(1, Math.floor(parts.length / 2));
    senderAddr1 = parts.slice(0, mid).join(', ') + ',';
    senderAddr2 = parts.slice(mid).join(', ');
  }

  const stateNotes = [state, notes].filter(Boolean).join(' ');

  // Extract non-zero case breakdown items
  // Items with quantity 0 are strictly excluded (per user requirement)
  const breakdownLines: string[] = [];
  if (caseBreakdown && caseBreakdown.length > 0) {
    caseBreakdown.forEach((b) => {
      const qty = Number(b.qty) || 0;
      if (qty > 0) {
        const typeStr = (b.type || 'CASE').trim().toUpperCase();
        const volStr = (b.volume || '').trim().toUpperCase();
        if (volStr) {
          breakdownLines.push(`${typeStr} ${volStr}: ${qty}`);
        } else {
          breakdownLines.push(`${typeStr}: ${qty}`);
        }
      }
    });
  }

  // Fallback to CASE: N if no items with qty > 0 were specified
  if (breakdownLines.length === 0 && showCaseNumber && caseItem.case_total > 0) {
    breakdownLines.push(`CASE: ${caseItem.case_total}`);
  }

  return (
    <div
      className={`bg-white text-black select-none flex flex-col justify-start relative ${className}`}
      style={{
        width: isPrintMode ? '100%' : '740px',
        minHeight: isPrintMode ? '132mm' : '430px',
        padding: isPrintMode ? '2mm 6mm' : '22px 26px',
        transform: !isPrintMode && scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif',
      }}
    >
      <div className="flex justify-between w-full h-full">
        {/* Left Column: Recipient Info (Larger & Bolder) */}
        <div className="w-[58%] flex flex-col justify-start text-left">
          <div className="text-[20px] font-black underline tracking-wide uppercase mb-2">
            {toHeader}
          </div>
          <div className="text-[17px] font-black uppercase tracking-tight leading-tight">
            {partyName}
          </div>
          <div className="text-[17px] font-black uppercase tracking-tight leading-tight mb-2">
            {partyName},
          </div>
          <div className="text-[14.5px] font-bold uppercase leading-snug my-1 space-y-0.5">
            <div>{address}</div>
            {addressLine2 && <div>{addressLine2}</div>}
            {addressLine3 && <div>{addressLine3}</div>}
          </div>
          {stateNotes && (
            <div className="text-[14.5px] font-bold uppercase tracking-tight mb-2">
              {stateNotes}
            </div>
          )}
          {mobile && (
            <div className="text-[16px] font-black underline tracking-wide mt-1">
              MOB NO:- {mobile}
            </div>
          )}
        </div>

        {/* Right Column: Case Breakdown & Sender Info */}
        <div className="w-[40%] flex flex-col justify-between text-right">
          {/* Top Right: Dynamic Case Breakdown (Strictly non-zero) */}
          <div className="text-right pt-0.5 space-y-0.5">
            {breakdownLines.map((line, idx) => (
              <div key={idx} className="text-[15.5px] font-black text-black tracking-tight">
                {line}
              </div>
            ))}
          </div>

          {/* Bottom Right: Sender Info */}
          <div className="text-left mt-auto pl-3 space-y-0.5">
            <div className="text-[16px] font-black tracking-tight mb-0.5">FROM,</div>
            <div className="text-[15px] font-black uppercase tracking-tight leading-tight">
              {senderName}
            </div>
            <div className="text-[13px] font-bold uppercase leading-tight">
              {senderAddr1}
            </div>
            {senderAddr2 && (
              <div className="text-[13px] font-bold uppercase leading-tight">
                {senderAddr2}
              </div>
            )}
            <div className="text-[14px] font-black underline tracking-tight mt-1">
              MOB NO.: {senderMobile}
            </div>
            <div className="text-[13px] font-bold tracking-tight">
              MAIL: {senderEmail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
