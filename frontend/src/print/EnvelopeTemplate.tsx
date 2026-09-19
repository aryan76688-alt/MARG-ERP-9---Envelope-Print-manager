import React from 'react';
import { Party, SenderSettings, AppSettings, CaseItem } from '../types';

interface EnvelopeTemplateProps {
  party: Partial<Party>;
  sender: SenderSettings;
  caseItem: CaseItem;
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
  const caseBadge = showCaseNumber && caseItem.case_total > 1 ? `CASE: ${caseItem.case_number}/${caseItem.case_total}` : '';

  return (
    <div
      className={`bg-white text-black select-none flex flex-col justify-between overflow-hidden ${className}`}
      style={{
        width: isPrintMode ? '100%' : '720px',
        minHeight: isPrintMode ? '135mm' : '480px',
        maxHeight: isPrintMode ? '140mm' : undefined,
        padding: isPrintMode ? '2mm 4mm' : '16px 20px',
        transform: !isPrintMode && scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif',
      }}
    >
      {/* Exact MARG Courier Grid Table */}
      <table className="w-full border-collapse border-[1.5px] border-black text-black">
        <colgroup>
          <col style={{ width: '14.2857%' }} />
          <col style={{ width: '14.2857%' }} />
          <col style={{ width: '14.2857%' }} />
          <col style={{ width: '14.2857%' }} />
          <col style={{ width: '14.2857%' }} />
          <col style={{ width: '14.2857%' }} />
          <col style={{ width: '14.2857%' }} />
        </colgroup>
        <tbody>
          {/* Row 1: TO - CITY & Case Number */}
          <tr className="h-6">
            <td colSpan={3} className="border border-black px-2 py-0.5 font-black text-sm tracking-wide underline">
              {toHeader}
            </td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black px-2 py-0.5 font-black text-xs text-right">
              {caseBadge}
            </td>
          </tr>

          {/* Row 2: empty row */}
          <tr className="h-4">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 3: Party Name Line 1 (Double height) */}
          <tr className="h-8">
            <td colSpan={3} className="border border-black px-2 py-0.5 font-extrabold text-xs tracking-tight">
              {partyName}
            </td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 4: Party Name Line 2 (with comma) */}
          <tr className="h-6">
            <td colSpan={3} className="border border-black px-2 py-0.5 font-extrabold text-xs tracking-tight">
              {partyName},
            </td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 5: Multi-line Address (Fits any address length) */}
          <tr className="min-h-8">
            <td colSpan={3} className="border border-black px-2 py-1 font-extrabold text-[11px] leading-snug">
              <div>{address}</div>
              {addressLine2 && <div className="font-bold text-[10px] text-slate-900">{addressLine2}</div>}
              {addressLine3 && <div className="font-bold text-[10px] text-slate-800">{addressLine3}</div>}
            </td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 6: State & Doctor/Notes */}
          <tr className="h-6">
            <td colSpan={3} className="border border-black px-2 py-0.5 font-extrabold text-xs">
              {state} {notes}
            </td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 7: empty row (merged double height) */}
          <tr className="h-10">
            <td colSpan={7} className="border border-black"></td>
          </tr>

          {/* Row 8: Recipient Mobile */}
          <tr className="h-7">
            <td colSpan={3} className="border border-black px-2 py-0.5 font-black text-[13px] underline">
              MOB NO:- {mobile}
            </td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 9: empty row (merged double height) */}
          <tr className="h-10">
            <td colSpan={7} className="border border-black"></td>
          </tr>

          {/* Rows 10, 11, 12: empty spacing rows */}
          <tr className="h-5"><td className="border border-black" colSpan={7}></td></tr>
          <tr className="h-5"><td className="border border-black" colSpan={7}></td></tr>
          <tr className="h-5">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 13: FROM, */}
          <tr className="h-7">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td colSpan={4} className="border border-black px-2 py-0.5 font-black text-sm">
              FROM,
            </td>
          </tr>

          {/* Row 14: empty row */}
          <tr className="h-5">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 15: Sender Business Name */}
          <tr className="h-7">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td colSpan={3} className="border border-black px-2 py-0.5 font-extrabold text-xs">
              {senderName}
            </td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 16: empty row */}
          <tr className="h-5">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 17: Sender Address (Double height) */}
          <tr className="h-10">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td colSpan={4} className="border border-black px-2 py-1 font-bold text-[11px] leading-tight">
              {senderAddr}
            </td>
          </tr>

          {/* Row 18: Sender Mobile */}
          <tr className="h-7">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td colSpan={3} className="border border-black px-2 py-0.5 font-black text-xs underline">
              MOB NO.: {senderMobile}
            </td>
            <td className="border border-black"></td>
          </tr>

          {/* Row 19: Sender Email */}
          <tr className="h-7">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td colSpan={4} className="border border-black px-2 py-0.5 font-black text-xs">
              MAIL: {senderEmail}
            </td>
          </tr>

          {/* Rows 20, 21: empty closing rows */}
          <tr className="h-5">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>
          <tr className="h-5">
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
            <td className="border border-black"></td>
          </tr>
        </tbody>
      </table>

      {/* Footer centered text */}
      <div className={`text-center text-slate-700 font-normal ${isPrintMode ? 'text-[8px] pt-2 pb-0.5' : 'text-[10px] pt-4 pb-1'}`}>
        MARG Courier Envelope
      </div>
    </div>
  );
};
