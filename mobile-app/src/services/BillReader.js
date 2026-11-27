import { isRizoNew } from './CompanyFeatures';
import { BillReaderApi, isNetworkError } from './RevampApi';

// The expense bill reader in the app: the attached bill (photo or PDF) is read on the server
// (rizo-revamp api/document-reader/bill — OCR + rules, no AI) and the claim form is filled from it.
//   - GRTL / MYPY only (the companies on the new server); others attach the bill as before.
//   - Only EMPTY fields are filled; a reading the server is unsure of, or one that differs from what was
//     typed, is offered with a "Use" button instead. The person checks everything before submitting.

export const canReadBills = (user) => isRizoNew(user?.user_id);

/** Amount as the form's box shows it: "1050", "1563.50" */
export const amountText = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

/**
 * The company's Expense Type for the kind of bill (the server's fields.kind: { value, confidence, typeWords }):
 * the first of the kind's words (in order) found in exactly one type name; a word found in several names picks
 * the one that is just that word ("Fuel"), else none. Same rule as the web forms (components/expenses/BillReader.tsx).
 */
export const matchExpenseType = (kind, names) => {
  if (!kind || !Array.isArray(kind.typeWords)) return null;
  const list = (names || []).filter((n) => typeof n === 'string' && n.trim());
  for (const word of kind.typeWords) {
    const hits = list.filter((n) => n.toLowerCase().includes(word));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return hits.find((n) => n.trim().toLowerCase() === word) || null;
  }
  return null;
};

/** "Bill No. 1234 · Vendor · GSTIN …" for Remarks — only when the bill shows a bill no. or a GSTIN */
export const billRemarks = (fields) => {
  const billNo = fields?.billNo?.value, gstin = fields?.gstin?.value;
  if (!billNo && !gstin) return null;
  return [billNo && `Bill No. ${billNo}`, fields?.vendor?.value, gstin && `GSTIN ${gstin}`].filter(Boolean).join(' · ').slice(0, 200);
};

/**
 * What to fill and what to offer. fields: the server's readings ({ value, confidence } | null, plus kind);
 * current: the form's { amount, date, vendor, type (the chosen Expense Type's name), remarks } now;
 * typeNames: the company's Expense Type names.
 * -> { fill: { key: value }, filled: [key], matched: [key] (read, and already what the form says), suggestions: [{ key, value }] }
 * Only empty fields are filled; an unsure reading or one different from what is there is offered ("Use").
 * Remarks is only ever filled into an empty box, never offered over what was typed.
 */
export const planBillFill = (fields, current, typeNames = []) => {
  const fill = {};
  const filled = [];
  const matched = [];
  const suggestions = [];
  const reads = { amount: fields && fields.amount, date: fields && fields.date, vendor: fields && fields.vendor };
  const typeName = matchExpenseType(fields && fields.kind, typeNames);
  if (typeName) reads.type = { value: typeName, confidence: fields.kind.confidence };
  for (const key of ['amount', 'date', 'vendor', 'type']) {
    const r = reads[key];
    if (!r || r.value == null || r.value === '') continue;
    const value = key === 'amount' ? amountText(r.value) : String(r.value);
    const now = current && current[key] ? String(current[key]) : '';
    if (now === value || (key === 'amount' && now && Number(now) === Number(value))) { matched.push(key); continue; }
    if (r.confidence === 'low' || now) suggestions.push({ key, value });
    else { fill[key] = value; filled.push(key); }
  }
  const remarks = billRemarks(fields);
  if (remarks && !(current && String(current.remarks || '').trim())) { fill.remarks = remarks; filled.push('remarks'); }
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

export const BILL_LABELS = { amount: 'Amount', date: 'Date', vendor: 'Vendor', type: 'Expense Type', remarks: 'Remarks' };
