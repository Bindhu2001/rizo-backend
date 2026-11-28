import axios from 'axios';
import { API_ENDPOINTS } from '../constants/Config';

// Scanning documents during self sign-up (no login yet): the photo is read on the server (rizo-revamp
// api/mobile/signup/read-document — OCR + rules, nothing stored) and the sign-up's empty boxes are filled.
// Rizo-new companies (the server decides: $doCompanyCodes) only. What the person typed is never overwritten; a different or unsure reading is offered with "Use".

// Sign-up has no login: whether this company is on the new Rizo server comes with its countries list
// (newapp/countries → rizo_new, decided by the server), saved here by SignupScreen for the code it was asked for.
let signupCompany = { code: '', rizoNew: false };
const normCode = (c) => String(c || '').trim().toUpperCase();
export const setSignupCompany = (code, rizoNew) => { signupCompany = { code: normCode(code), rizoNew: !!rizoNew }; };
export const isSignupRizoNew = (companyCode) => signupCompany.rizoNew && !!signupCompany.code && signupCompany.code === normCode(companyCode);
export const canScanAtSignup = (companyCode) => isSignupRizoNew(companyCode);

/** { fields } as read from the photo ({ uri, name, mimeType }), or throws */
export const readSignupPhoto = async (companyCode, file, expect) => {
  const fd = new FormData();
  fd.append('company_code', String(companyCode || '').trim().toUpperCase());
  if (expect) fd.append('expect', expect);
  fd.append('file', { uri: file.uri, name: file.name || 'document.jpg', type: file.mimeType || 'image/jpeg' });
  const res = await axios.post(API_ENDPOINTS.SIGNUP_READ_DOCUMENT, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 45000 });
  return res.data;
};

export const scanError = (e) => {
  if (e && !e.response) return 'No internet: the photo could not be read. Please type the details.';
  return e?.response?.data?.error || 'Could not read this photo. Please type the details.';
};

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const value = (r, f = (v) => v) => (r && r.value ? { value: f(String(r.value)), confidence: r.confidence } : null);

export const SCAN_LABELS = {
  name: 'Name', dob: 'Date of Birth', gender: 'Gender', aadhaar: 'Aadhaar Number', pan: 'PAN Number', bankName: 'Bank Name', ifsc: 'IFSC Code', account: 'Account Number', uan: 'UAN No', esi: 'ESI No',
  house: 'House / Flat', line2: 'Address Line 2', city: 'City', district: 'District', state: 'State', pincode: 'Pin Code', guardianName: 'Guardian Name', guardianRelation: 'Relation',
};

// The back of an Aadhaar (server: fields.address): address, PIN and the S/O / W/O / C/O name as the guardian
const aadhaarBack = (f) => {
  const a = f.address || {};
  return {
    house: value(a.house), line2: value(a.street), city: value(a.city), district: value(a.district), state: value(a.state), pincode: value(a.pincode),
    guardianName: value(a.careOf), guardianRelation: value(a.relation),
  };
};

// Each scan button: what the server should expect, what the document must be, and which sign-up boxes it fills
export const SCANS = {
  aadhaar: {
    button: 'Scan Aadhaar', kind: 'Aadhaar', docType: 'Aadhaar',
    // An e-Aadhaar print has both sides on one page: its address fills the Address step too
    take: (f) => ({ name: value(f.name, titleCase), dob: value(f.dob), gender: value(f.gender), aadhaar: value(f.number), ...aadhaarBack(f) }),
  },
  aadhaarBack: {
    button: 'Scan Aadhaar (back)', kind: 'Aadhaar', docType: 'Aadhaar', label: 'Aadhaar (back)',
    take: (f) => ({ ...aadhaarBack(f), aadhaar: value(f.number) }),
  },
  pan: { button: 'Scan PAN', kind: 'PAN', docType: 'PAN', take: (f) => ({ pan: value(f.number) }) },
  bank: {
    button: 'Scan passbook / cheque', kind: 'Bank', docType: 'Other',
    take: (f) => ({ bankName: value(f.bankName), ifsc: value(f.ifsc), account: value(f.accountNo) }),
  },
  uan: { button: 'Scan UAN card', kind: 'UAN Card', docType: 'Other', take: (f) => ({ uan: value(f.number) }) },
  esi: { button: 'Scan ESI card', kind: 'ESI Card', docType: 'Other', take: (f) => ({ esi: value(f.number) }) },
};

const KIND_NAMES = { Bank: 'a bank passbook / cheque', Other: 'something else' };
const kindName = (k) => KIND_NAMES[k] || (/^[AEIOU]/.test(k) ? `an ${k}` : `a ${k}`);

/**
 * What to fill and what to offer. `now`: the sign-up's values by the same keys. allow(key, value): false leaves it
 * (e.g. a date of birth under 18). -> { fill, filled, matched, suggestions, message }
 */
export const planScan = (scan, fields, now, allow = () => true) => {
  const spec = SCANS[scan];
  const out = { fill: {}, filled: [], matched: [], suggestions: [], message: '' };
  if (!fields || fields.kind === 'Other') {
    out.message = 'Couldn’t read this photo. Please take it again in good light, or type the details.';
    return out;
  }
  if (fields.kind !== spec.kind) {
    out.message = `This looks like ${kindName(fields.kind)}, not ${kindName(spec.kind)}. Nothing was filled.`;
    return out;
  }
  for (const [key, r] of Object.entries(spec.take(fields))) {
    if (!r || !allow(key, r.value)) continue;
    const have = String((now && now[key]) || '').trim();
    if (have.toLowerCase() === r.value.toLowerCase()) out.matched.push(key);
    else if (have || r.confidence === 'low') out.suggestions.push({ key, value: r.value });
    else { out.fill[key] = r.value; out.filled.push(key); }
  }
  if (!out.filled.length && !out.matched.length && !out.suggestions.length) out.message = 'Couldn’t read the details on this photo. Please type them.';
  return out;
};

/** The scanned photo kept for the Documents step, so it is not taken twice */
export const scannedDocument = (scan, fields, file) => ({
  id: `${scan}-${Date.now()}`,
  scan,
  document_type: SCANS[scan].docType,
  document_number: String(fields?.number?.value || ''),
  name: titleCase(fields?.name?.value),
  classification: fields?.gender?.value || '',
  label: SCANS[scan].label || (SCANS[scan].kind === 'Bank' ? 'Passbook / cheque' : SCANS[scan].kind),
  file: { uri: file.uri, name: file.name || 'document.jpg', mimeType: file.mimeType || 'image/jpeg', size: file.size },
});
