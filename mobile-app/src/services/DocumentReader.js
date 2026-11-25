import { DocumentReaderApi, isNetworkError } from './RevampApi';

// A joining document (Aadhaar, PAN, passport, licence, voter ID, passbook, certificate) read on the server
// (rizo-revamp api/document-reader/document — OCR + rules, no AI) to fill the Add Document form. Same rules as the web
// form: only EMPTY boxes are filled; an unsure or different reading is offered with "Use"; the person checks it.

export const DOC_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'Voter ID', 'Educational Certificate', 'Offer Letter', 'Relieving Letter', 'Other'];
export const DOC_LABELS = { type: 'Document Type', number: 'Number', name: 'Name', validFrom: 'Valid From', validTill: 'Valid Till', gender: 'Gender' };
export const DMY = (iso) => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}-${m}-${y}` : ''; };

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const cleanNumber = (s) => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** fields: the server's reading; now: { type, number, name, validFrom, validTill, gender }. -> { fill, filled, matched, suggestions, extra, kind } */
export const planDocFill = (fields, now) => {
  const out = { fill: {}, filled: [], matched: [], suggestions: [], extra: [], kind: fields?.kind || 'Other' };
  if (!fields) return out;
  const type = ['Bank', 'UAN Card', 'ESI Card'].includes(fields.kind) ? 'Other' : fields.kind && fields.kind !== 'Other' && DOC_TYPES.includes(fields.kind) ? fields.kind : '';
  const put = (key, value, confidence) => {
    if (!value) return;
    const have = now && now[key] ? String(now[key]) : '';
    if (have === value) { out.matched.push(key); return; }
    if (confidence === 'low' || have) out.suggestions.push({ key, value });
    else { out.fill[key] = value; out.filled.push(key); }
  };
  put('type', type, 'high');
  put('number', cleanNumber(fields.number?.value), fields.number?.confidence);
  put('name', titleCase(fields.name?.value), fields.name?.confidence);
  put('validFrom', fields.validFrom?.value, fields.validFrom?.confidence);
  put('validTill', fields.validTill?.value, fields.validTill?.confidence);
  put('gender', fields.gender?.value, fields.gender?.confidence);
  if (fields.dob?.value) out.extra.push(`Date of birth ${DMY(fields.dob.value)}`);
  if (fields.guardian?.value) out.extra.push(`Father's name ${titleCase(fields.guardian.value)}`);
  if (fields.ifsc?.value) out.extra.push(`IFSC ${fields.ifsc.value}${fields.bankName?.value ? ` (${fields.bankName.value})` : ''}`);
  return out;
};

export const readDocumentFile = async (file, expect) => {
  const fd = new FormData();
  const type = file.mimeType || (/\.pdf$/i.test(file.name || '') ? 'application/pdf' : 'image/jpeg');
  fd.append('file', { uri: file.uri, name: file.name || (type === 'application/pdf' ? 'document.pdf' : 'document.jpg'), type });
  if (expect) fd.append('expect', expect);
  return DocumentReaderApi.read(fd);
};

export const documentReadError = (e) => {
  if (isNetworkError(e)) return 'No internet: the document could not be read. Please type the details.';
  return e?.response?.data?.error || 'Could not read this document. Please type the details.';
};
