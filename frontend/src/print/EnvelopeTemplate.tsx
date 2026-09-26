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
  templateFormat?: 'attachment_pdf' | 'marg_grid_22';
  language?: 'en' | 'gu';
}

const normalizeDigits = (str?: string | null): string => {
  if (!str) return '';
  const gujaratiDigits = '૦૧૨૩૪૫૬૭૮૯';
  return str.replace(/[૦-૯]/g, (ch) => String(gujaratiDigits.indexOf(ch)));
};

export const formatCaseBreakdownItem = (typeStr?: string, volStr?: string, qty: number = 1): string => {
  const cleanType = (typeStr || 'CASE').trim().toUpperCase();
  const cleanVol = (volStr || '').trim().toUpperCase();

  // Check if string is already formatted like "NS CASE 100ML: 1", "NS 100 CASE: 1" or "NS 100ML CASE: 1"
  const m = cleanType.match(/^(NS|DNS|RL|METRO)\s*(?:CASE)?\s*(\d+)\s*(ML|LTR)?\s*(?:CASE)?:\s*(\d+)$/i);
  if (m) {
    const unit = m[3] ? m[3].toUpperCase() : 'ML';
    return `${m[1].toUpperCase()} ${m[2]}${unit} CASE: ${m[4]}`;
  }

  const typeBase = cleanType.replace(/\s*CASE/g, '').trim();

  if (['NS', 'DNS', 'RL', 'METRO'].includes(typeBase) && cleanVol) {
    const volDisplay = /^\d+$/.test(cleanVol) ? `${cleanVol}ML` : cleanVol;
    return `${typeBase} ${volDisplay} CASE: ${qty}`;
  } else if (cleanVol) {
    const volDisplay = /^\d+$/.test(cleanVol) ? `${cleanVol}ML` : cleanVol;
    const prefix = typeBase || cleanType;
    return `${prefix} ${volDisplay} CASE: ${qty}`;
  } else {
    if (!cleanType.endsWith('CASE') && !['PARCEL BAG', 'BOX', 'CARTON', 'BAG'].includes(cleanType)) {
      return `${cleanType} CASE: ${qty}`;
    }
    return `${cleanType}: ${qty}`;
  }
};


export const EnvelopeTemplate: React.FC<EnvelopeTemplateProps> = ({
  party,
  sender,
  caseItem,
  caseBreakdown,
  settings,
  scale = 1,
  className = '',
  isPrintMode = false,
  templateFormat = 'attachment_pdf',
  language = 'en',
}) => {
  const showCaseNumber = settings?.show_case_number ?? true;
  const isGu = language === 'gu';

  // Recipient details based on language (Strictly keep numbers in 0-9 digits)
  const partyName = normalizeDigits(
    isGu
      ? party.party_name_gu || party.party_name || 'જોધપુર મેડિકોઝ'
      : (party.party_name || 'JODHPUR MEDICOSE').toUpperCase()
  );

  const address = normalizeDigits(
    isGu
      ? party.address_gu || party.address || 'શ્રી મોહનગઢ, જેસલમેર'
      : (party.address || 'SHREE MOHANGADH , JAISALMER').toUpperCase()
  );

  const addressLine2 = normalizeDigits(
    isGu
      ? (party.address_line_2_gu || party.address_line_2 || '')
      : (party.address_line_2 || '').toUpperCase()
  );

  const addressLine3 = normalizeDigits(
    isGu
      ? (party.address_line_3_gu || party.address_line_3 || '')
      : (party.address_line_3 || '').toUpperCase()
  );

  const city = normalizeDigits(
    isGu
      ? party.city_gu || party.city || 'જેસલમેર'
      : (party.city || 'JAISALMER').toUpperCase()
  );

  const state = normalizeDigits(
    isGu
      ? party.state_gu || party.state || 'ગુજરાત'
      : (party.state || 'RAJASTHAN').toUpperCase()
  );

  const mobile = normalizeDigits(party.mobile_no || '+91 8963003012');
  const notes = normalizeDigits((party.notes || '').toUpperCase());

  // Sender details based on language (Strictly keep numbers in 0-9 digits)
  let senderName = '';
  let senderAddr1 = '';
  let senderAddr2 = '';
  let senderMobile = normalizeDigits(sender.mobile || '+91 99245 44283');
  let senderEmail = (sender.email || 'SHREEJISEVEN@GMAIL.COM').toUpperCase();
  let toHeader = '';
  let fromTitle = '';
  let mobLabel = '';
  let mailLabel = '';

  if (isGu) {
    senderName = 'શ્રીજી હેલ્થકેર';
    senderAddr1 = 'શોપ 3&4 જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ,';
    senderAddr2 = 'દહેગામ-382305.';
    toHeader = city ? `TO - ${city}` : 'TO -';
    fromTitle = 'FROM,';
    mobLabel = 'મો. નં.: ';
    mailLabel = 'ઈમેલ: ';
  } else {
    senderName = (sender.business_name || 'SHREEJI HEALTHCARE-HEALTHCARE').toUpperCase();
    const rawSenderAddr = (sender.address || 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD, DEHGAM-382305').toUpperCase();
    if (rawSenderAddr.includes('DEHGAM-MODASA ROAD')) {
      senderAddr1 = 'SHOP 3&4 GF-NARAYAN COMPLEX, DEHGAM-MODASA ROAD,';
      senderAddr2 = 'DEHGAM-382305.';
    } else if (rawSenderAddr.includes(',')) {
      const parts = rawSenderAddr.split(',').map((p) => p.trim());
      const mid = Math.max(1, Math.floor(parts.length / 2));
      senderAddr1 = parts.slice(0, mid).join(', ') + ',';
      senderAddr2 = parts.slice(mid).join(', ');
    } else {
      senderAddr1 = rawSenderAddr;
      senderAddr2 = '';
    }
    toHeader = city ? `TO - ${city}` : 'TO -';
    fromTitle = 'FROM,';
    mobLabel = 'MOB NO:- ';
    mailLabel = 'MAIL: ';
  }

  const stateNotes = [state, notes].filter(Boolean).join(' ');

  // Extract non-zero case breakdown items
  // Items with quantity 0 are strictly excluded (per user requirement)
  // User requirement: DON'T TRANSLATE TO-,FROM-,CASES, ONLY TRANSLATE ADDRESS,MO. NO.
  const breakdownLines: string[] = [];
  if (caseBreakdown && caseBreakdown.length > 0) {
    caseBreakdown.forEach((b) => {
      const qty = Number(b.qty) || 0;
      if (qty > 0) {
        breakdownLines.push(formatCaseBreakdownItem(b.type, b.volume, qty));
      }
    });
  }


  // Fallback to CASE: N if no items with qty > 0 were specified
  if (breakdownLines.length === 0 && showCaseNumber && caseItem.case_total > 0) {
    breakdownLines.push(`CASE: ${caseItem.case_total}`);
  }

  // FORMAT 1: Classic MARG 22-Row Grid Format
  if (templateFormat === 'marg_grid_22') {
    const caseBadge = breakdownLines[0] || 'CASE: 1';
    const extraCases = breakdownLines.slice(1);

    return (
      <div
        className={`bg-white text-black select-none flex flex-col justify-start relative ${className}`}
        style={{
          width: isPrintMode ? '100%' : '740px',
          minHeight: isPrintMode ? '132mm' : '430px',
          padding: isPrintMode ? '2mm 4mm' : '16px 20px',
          transform: !isPrintMode && scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: isGu ? '"Noto Sans Gujarati", Lohit Gujarati, Arial, sans-serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
        }}
      >
        <table className="w-full border-collapse border border-gray-400 table-fixed text-[13px]">
          <colgroup>
            <col style={{ width: '14.28%' }} />
            <col style={{ width: '14.28%' }} />
            <col style={{ width: '14.28%' }} />
            <col style={{ width: '14.28%' }} />
            <col style={{ width: '14.28%' }} />
            <col style={{ width: '14.28%' }} />
            <col style={{ width: '14.28%' }} />
          </colgroup>
          <tbody>
            {/* Row 1: TO - CITY & Case Number */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-black text-[17px] underline">{toHeader}</td>
              <td className="border-l border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td className="px-2 text-right font-black border-l border-gray-300">
                <div className="inline-block border-[1.8px] border-black rounded px-2 py-0.5 text-[12.5px] font-black text-black bg-white whitespace-nowrap mb-0.5">
                  {caseBadge}
                </div>
                {extraCases.map((ec, i) => (
                  <div key={i} className="inline-block border-[1.8px] border-black rounded px-2 py-0.5 text-[12.5px] font-black text-black bg-white whitespace-nowrap mt-0.5">
                    {ec}
                  </div>
                ))}
              </td>

            </tr>

            {/* Row 2: Empty Spacer */}
            <tr className="border-b border-gray-300 h-4">
              <td colSpan={7}></td>
            </tr>

            {/* Row 3: Party Name (Printed ONCE only) */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-black text-[17px] tracking-tight">{partyName}</td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 4: Multi-line Address (Lines 1, 2, 3) */}
            <tr className="border-b border-gray-300 h-10">
              <td colSpan={3} className="px-2 font-bold text-[15px] align-top">
                <div>{address}</div>
                {addressLine2 && <div>{addressLine2}</div>}
                {addressLine3 && <div>{addressLine3}</div>}
              </td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 5: State (City / State, no dr.name) */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-bold text-[14px]">{state}</td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 6: Recipient Mobile */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-black text-[16px] underline">{mobLabel}{mobile}</td>
              <td colSpan={4}></td>
            </tr>

            {/* Rows 7-10: Spacers to maintain exact 22-row grid */}
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>

            {/* Row 11: FROM */}
            <tr className="border-b border-gray-300 h-5">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-black text-[15px]">{fromTitle}</td>
            </tr>

            {/* Row 12: Sender Name */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-black text-[15.5px] tracking-tight">{senderName}</td>
            </tr>

            {/* Row 13: Sender Address Line 1 */}
            <tr className="border-b border-gray-300 h-5">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-bold text-[13.5px]">{senderAddr1}</td>
            </tr>

            {/* Row 14: Sender Address Line 2 */}
            {senderAddr2 && (
              <tr className="border-b border-gray-300 h-5">
                <td colSpan={3}></td>
                <td colSpan={4} className="px-2 font-bold text-[13.5px]">{senderAddr2}</td>
              </tr>
            )}

            {/* Row 15: Sender Mobile */}
            <tr className="border-b border-gray-300 h-5">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-black text-[13px] underline">{mobLabel}{senderMobile}</td>
            </tr>

            {/* Row 16: Sender Email */}
            <tr className="border-b border-gray-300 h-5">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-bold text-[12px]">{mailLabel}{senderEmail}</td>
            </tr>

            {/* Rows 17-22: Trailing grid rows */}
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  // FORMAT 2: Attachment PDF 123 (Borderless Modern Format with Large Bold Fonts)
  return (
    <div
      className={`bg-white text-black select-none flex flex-col justify-start relative ${className}`}
      style={{
        width: isPrintMode ? '100%' : '740px',
        minHeight: isPrintMode ? '132mm' : '430px',
        padding: isPrintMode ? '2mm 6mm' : '22px 26px',
        transform: !isPrintMode && scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
        fontFamily: isGu ? '"Noto Sans Gujarati", Lohit Gujarati, Arial, sans-serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif',
      }}
    >
      <div className="flex justify-between w-full h-full">
        {/* Left Column: Recipient Info (Larger & Bolder) */}
        <div className="w-[58%] flex flex-col justify-start text-left">
          <div className="text-[22px] font-black underline tracking-wide mb-2">
            {toHeader}
          </div>
          <div className="text-[19px] font-black tracking-tight leading-tight mb-2">
            {partyName}
          </div>
          <div className="text-[16px] font-bold leading-snug my-1 space-y-0.5">
            <div>{address}</div>
            {addressLine2 && <div>{addressLine2}</div>}
            {addressLine3 && <div>{addressLine3}</div>}
          </div>
          {state && (
            <div className="text-[16px] font-bold tracking-tight mb-2">
              {state}
            </div>
          )}
          {mobile && (
            <div className="text-[17.5px] font-black underline tracking-wide mt-1">
              {mobLabel}{mobile}
            </div>
          )}
        </div>

        {/* Right Column: Case Breakdown & Sender Info */}
        <div className="w-[40%] flex flex-col justify-between text-right">
          {/* Top Right: Dynamic Case Breakdown (Strictly non-zero, Single Line Compact Box) */}
          <div className="text-right pt-0.5 flex flex-col items-end">
            {breakdownLines.map((line, idx) => (
              <div 
                key={idx} 
                className="inline-block border-2 border-black rounded px-2.5 py-0.5 text-[15px] font-black text-black tracking-tight bg-white mb-1.5 whitespace-nowrap shadow-none"
              >
                {line}
              </div>
            ))}
          </div>


          {/* Bottom Right: Sender Info */}
          <div className="text-left mt-auto pl-3 space-y-0.5">
            <div className="text-[16px] font-black tracking-tight mb-0.5">{fromTitle}</div>
            <div className="text-[16px] font-black tracking-tight leading-tight">
              {senderName}
            </div>
            <div className="text-[14px] font-bold leading-tight">
              {senderAddr1}
            </div>
            {senderAddr2 && (
              <div className="text-[14px] font-bold leading-tight">
                {senderAddr2}
              </div>
            )}
            <div className="text-[15px] font-black underline tracking-tight mt-1">
              {mobLabel}{senderMobile}
            </div>
            <div className="text-[13.5px] font-bold tracking-tight">
              {mailLabel}{senderEmail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
