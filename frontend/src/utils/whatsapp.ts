export interface WhatsAppDispatchInfo {
  partyName: string;
  partyNameGu?: string;
  phone?: string | null;
  jobNumber?: string;
  totalCases: number;
  caseBreakdown?: Array<{ title?: string; type?: string; qty: number }>;
  driverName?: string | null;
  deliveryRoute?: string | null;
  city?: string | null;
  senderName?: string;
}

export function cleanIndianPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Remove non-numeric characters
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // If 10 digits, prepend 91
  if (digits.length === 10) {
    return `91${digits}`;
  }
  // If 12 digits starting with 91, return as is
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  // If starts with 0 and has 11 digits
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  // Otherwise return whatever digits if length >= 10
  if (digits.length >= 10) {
    return digits;
  }
  return null;
}

export function generateWhatsAppDispatchUrl(info: WhatsAppDispatchInfo, language: 'gu' | 'en' = 'en'): string | null {
  const cleanPhone = cleanIndianPhoneNumber(info.phone);
  const sender = info.senderName || 'SHREEJI 7';

  // Format case summary
  let caseDesc = '';
  if (info.caseBreakdown && info.caseBreakdown.length > 0) {
    const valid = info.caseBreakdown.filter(b => b.qty > 0);
    if (valid.length > 0) {
      caseDesc = valid.map(b => `${b.title || b.type}: ${b.qty}`).join(', ');
    }
  }
  if (!caseDesc) {
    caseDesc = `${info.totalCases} Case(s)`;
  }

  let text = '';
  if (language === 'gu') {
    text = `📦 *ડિસ્પેચ સૂચના - ${sender}*\n\n` +
      `નમસ્તે *${info.partyNameGu || info.partyName}*,\n\n` +
      `તમારો માલ રવાના થઈ ગયો છે.\n` +
      `• *જોબ નં*: ${info.jobNumber || 'N/A'}\n` +
      `• *કુલ કેસ*: ${info.totalCases} (${caseDesc})\n` +
      (info.deliveryRoute ? `• *રૂટ*: ${info.deliveryRoute}\n` : '') +
      (info.driverName ? `• *ડ્રાઈવર*: ${info.driverName}\n` : '') +
      (info.city ? `• *શહેર*: ${info.city}\n` : '') +
      `\nઆભાર,\n*${sender}*`;
  } else {
    text = `📦 *DISPATCH NOTIFICATION - ${sender}*\n\n` +
      `Dear *${info.partyName}*,\n\n` +
      `Your parcel has been dispatched.\n` +
      `• *Job No*: ${info.jobNumber || 'N/A'}\n` +
      `• *Total Cases*: ${info.totalCases} (${caseDesc})\n` +
      (info.deliveryRoute ? `• *Route*: ${info.deliveryRoute}\n` : '') +
      (info.driverName ? `• *Driver*: ${info.driverName}\n` : '') +
      (info.city ? `• *City*: ${info.city}\n` : '') +
      `\nThank you,\n*${sender}*`;
  }

  const encoded = encodeURIComponent(text);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  } else {
    // Open WhatsApp Web/App share dialog without specific phone number
    return `https://wa.me/?text=${encoded}`;
  }
}
