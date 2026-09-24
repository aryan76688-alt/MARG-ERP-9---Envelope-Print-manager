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

  // Recipient details based on language
  const partyName = isGu
    ? party.party_name_gu || party.party_name || 'જોધપુર મેડિકોઝ'
    : (party.party_name || 'JODHPUR MEDICOSE').toUpperCase();

  const address = isGu
    ? party.address_gu || party.address || 'શ્રી મોહનગઢ, જેસલમેર'
    : (party.address || 'SHREE MOHANGADH , JAISALMER').toUpperCase();

  const addressLine2 = isGu
    ? (party.address_line_2 || '')
    : (party.address_line_2 || '').toUpperCase();

  const addressLine3 = isGu
    ? (party.address_line_3 || '')
    : (party.address_line_3 || '').toUpperCase();

  const city = isGu
    ? party.city_gu || party.city || 'જેસલમેર'
    : (party.city || 'JAISALMER').toUpperCase();

  const state = isGu
    ? party.state_gu || party.state || 'ગુજરાત'
    : (party.state || 'RAJASTHAN').toUpperCase();

  const mobile = party.mobile_no || '+91 8963003012';
  const notes = (party.notes || '').toUpperCase();

  // Sender details based on language
  let senderName = '';
  let senderAddr1 = '';
  let senderAddr2 = '';
  let senderMobile = sender.mobile || '+91 99245 44283';
  let senderEmail = (sender.email || 'SHREEJISEVEN@GMAIL.COM').toUpperCase();
  let toHeader = '';
  let fromTitle = '';
  let mobLabel = '';
  let mailLabel = '';

  if (isGu) {
    senderName = 'શ્રીજી હેલ્થકેર';
    senderAddr1 = 'શોપ ૩&૪ જીએફ-નારાયણ કોમ્પ્લેક્ષ, દહેગામ-મોડાસા રોડ,';
    senderAddr2 = 'દહેગામ-૩૮૨૩૦૫.';
    toHeader = city ? `પ્રતિ - ${city}` : 'પ્રતિ -';
    fromTitle = 'પ્રેષક,';
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
  const breakdownLines: string[] = [];
  if (caseBreakdown && caseBreakdown.length > 0) {
    caseBreakdown.forEach((b) => {
      const qty = Number(b.qty) || 0;
      if (qty > 0) {
        let typeStr = (b.type || 'CASE').trim().toUpperCase();
        if (isGu) {
          const typeMap: Record<string, string> = {
            'CASE': 'કેસ',
            'NS CASE': 'એનએસ કેસ',
            'RL CASE': 'આરએલ કેસ',
            'DNS CASE': 'ડીએનએસ કેસ',
            'METRO CASE': 'મેટ્રો કેસ',
            'PARCEL BAG': 'પાર્સલ બેગ',
          };
          typeStr = typeMap[typeStr] || typeStr;
        }
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
    breakdownLines.push(isGu ? `કેસ: ${caseItem.case_total}` : `CASE: ${caseItem.case_total}`);
  }

  // FORMAT 1: Classic MARG 22-Row Grid Format
  if (templateFormat === 'marg_grid_22') {
    const caseBadge = breakdownLines[0] || (isGu ? 'કેસ: 1' : 'CASE: 1');
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
              <td colSpan={3} className="px-2 font-black text-[15px] underline">{toHeader}</td>
              <td className="border-l border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td className="border-r border-gray-300"></td>
              <td className="px-2 text-right font-black text-[13px] border-l border-gray-300">
                <div>{caseBadge}</div>
                {extraCases.map((ec, i) => (
                  <div key={i} className="text-[11px] font-bold">{ec}</div>
                ))}
              </td>
            </tr>

            {/* Row 2: Empty Spacer */}
            <tr className="border-b border-gray-300 h-4">
              <td colSpan={7}></td>
            </tr>

            {/* Row 3: Party Name Line 1 */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-black text-[15px] tracking-tight">{partyName}</td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 4: Party Name Line 2 (with comma) */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-black text-[15px] tracking-tight">{partyName},</td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 5: Address */}
            <tr className="border-b border-gray-300 h-10">
              <td colSpan={3} className="px-2 font-bold text-[13px] align-top">
                <div>{address}</div>
                {addressLine2 && <div>{addressLine2}</div>}
                {addressLine3 && <div>{addressLine3}</div>}
              </td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 6: State & Notes */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-bold text-[13px]">{stateNotes}</td>
              <td colSpan={4}></td>
            </tr>

            {/* Row 7: Empty row */}
            <tr className="border-b border-gray-300 h-4">
              <td colSpan={7}></td>
            </tr>

            {/* Row 8: Mobile */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3} className="px-2 font-black text-[14px] underline">{mobLabel}{mobile}</td>
              <td colSpan={4}></td>
            </tr>

            {/* Rows 9-10: Spacers */}
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>
            <tr className="border-b border-gray-300 h-4"><td colSpan={7}></td></tr>

            {/* Row 11: FROM */}
            <tr className="border-b border-gray-300 h-5">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-black text-[13px]">{fromTitle}</td>
            </tr>

            {/* Row 12: Sender Name */}
            <tr className="border-b border-gray-300 h-6">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-black text-[14px] tracking-tight">{senderName}</td>
            </tr>

            {/* Row 13: Sender Address Line 1 */}
            <tr className="border-b border-gray-300 h-5">
              <td colSpan={3}></td>
              <td colSpan={4} className="px-2 font-bold text-[12px]">{senderAddr1}</td>
            </tr>

            {/* Row 14: Sender Address Line 2 */}
            {senderAddr2 && (
              <tr className="border-b border-gray-300 h-5">
                <td colSpan={3}></td>
                <td colSpan={4} className="px-2 font-bold text-[12px]">{senderAddr2}</td>
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
          <div className="text-[20px] font-black underline tracking-wide mb-2">
            {toHeader}
          </div>
          <div className="text-[17px] font-black tracking-tight leading-tight">
            {partyName}
          </div>
          <div className="text-[17px] font-black tracking-tight leading-tight mb-2">
            {partyName},
          </div>
          <div className="text-[14.5px] font-bold leading-snug my-1 space-y-0.5">
            <div>{address}</div>
            {addressLine2 && <div>{addressLine2}</div>}
            {addressLine3 && <div>{addressLine3}</div>}
          </div>
          {stateNotes && (
            <div className="text-[14.5px] font-bold tracking-tight mb-2">
              {stateNotes}
            </div>
          )}
          {mobile && (
            <div className="text-[16px] font-black underline tracking-wide mt-1">
              {mobLabel}{mobile}
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
            <div className="text-[16px] font-black tracking-tight mb-0.5">{fromTitle}</div>
            <div className="text-[15px] font-black tracking-tight leading-tight">
              {senderName}
            </div>
            <div className="text-[13px] font-bold leading-tight">
              {senderAddr1}
            </div>
            {senderAddr2 && (
              <div className="text-[13px] font-bold leading-tight">
                {senderAddr2}
              </div>
            )}
            <div className="text-[14px] font-black underline tracking-tight mt-1">
              {mobLabel}{senderMobile}
            </div>
            <div className="text-[13px] font-bold tracking-tight">
              {mailLabel}{senderEmail}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
