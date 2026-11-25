import { isRevampCompany } from '../constants/Config';
import { BillReaderApi, isNetworkError } from './RevampApi';

// The expense bill reader in the app: the attached bill (photo or PDF) is read on the server
// (rizo-revamp api/document-reader/bill — OCR + rules, no AI) and the claim form is filled from it.
//   - GRTL / MYPY only (the companies on the new server); others attach the bill as before.
//   - Only EMPTY fields are filled; a reading the server is unsure of, or one that differs from what was
//     typed, is offered with a "Use" button instead. The person checks everything before submitting.

export const canReadBills = (user) => isRevampCompany(user?.user_id);

/** Amount as the form's box shows it: "1050", "1563.50" */
export const amountText = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

/**
 * What to fill and what to offer. fields: the server's { amount, date, vendor } readings
 * ({ value, confidence } | null); current: the form's { amount, date, vendor } now.
 * -> { fill: { key: value }, filled: [key], matched: [key] (read, and already what the form says), suggestions: [{ key, value }] }
 */
export const planBillFill = (fields, current) => {
  const fill = {};
  const filled = [];
  const matched = [];
  const suggestions = [];
  for (const key of ['amount', 'date', 'vendor']) {
    const r = fields && fields[key];
    if (!r || r.value == null || r.value === '') continue;
    const value = key === 'amount' ? amountText(r.value) : String(r.value);
    const now = current && current[key] ? String(current[key]) : '';
    if (now === value || (key === 'amount' && now && Number(now) === Number(value))) { matched.push(key); continue; }
    if (r.confidence === 'low' || now) suggestions.push({ key, value });
    else { fill[key] = value; filled.push(key); }
  }
  return { fill, filled, matched, suggestions };
};

/** Sends the attached file ({ uri, name, mimeType }) to the reader. Resolves to the server's reading or throws. */
export const readBillFile = async (file) => {
  const fd = new FormData();
  const type = file.mimeType || (/\.pdf$/i.test(file.name || '') ? 'application/pdf' : 'image/jpeg');
  fd.append('file', { uri: file.uri, name: file.name || (type === 'application/pdf' ? 'bill.pdf' : 'bill.jpg'), type });
  return BillReaderApi.read(fd);
};

/** The message for a failed reading */
export const billReadError = (e) => {
  if (isNetworkError(e)) return 'No internet: the bill could not be read. Please type the details.';
  return e?.response?.data?.error || 'Could not read this bill. Please type the details.';
};

export const BILL_LABELS = { amount: 'Amount', date: 'Date', vendor: 'Vendor' };
