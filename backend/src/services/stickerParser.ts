export interface ParsedStickerData {
  rawName: string | null;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  dob: string | null;
  age: string | null;
  mrn: string | null;
  account: string | null;
  dateOfService: string | null;
  location: string | null;
  patientId: string | null;
  confidenceWarnings: string[];
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extract(regex: RegExp, source: string): string | null {
  const match = source.match(regex);
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function extractAccount(source: string): string | null {
  const candidates = [
    /A\s*[#:]?\s*([0-9]{6,})/i,
    /A[#:]\s*([0-9\s]{6,})/i,
    /\bA\b\s*([0-9]{6,})/i,
  ];

  for (const regex of candidates) {
    const match = source.match(regex);
    if (match?.[1]) {
      const digitsOnly = match[1].replace(/\D/g, '');
      if (digitsOnly.length >= 6) {
        return digitsOnly;
      }
    }
  }

  return null;
}

function toIsoDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return value;
  }

  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

function parseName(lines: string[]): Pick<ParsedStickerData, 'rawName' | 'firstName' | 'lastName' | 'gender'> {
  const candidate =
    lines.find((line) => line.includes(',') && !/(DOB|Age|DOS|LOC|M#|A#)/i.test(line)) ||
    null;

  if (!candidate) {
    return {
      rawName: null,
      firstName: null,
      lastName: null,
      gender: null,
    };
  }

  const rawName = normalizeWhitespace(candidate.replace(/[^A-Za-z, ]/g, ' '));
  const [lastNameRaw, rightSideRaw = ''] = rawName.split(',', 2);
  const lastName = normalizeWhitespace(lastNameRaw);

  let gender: string | null = null;
  let firstNameCandidate = normalizeWhitespace(rightSideRaw);

  if (/^BOY\s*/i.test(firstNameCandidate)) {
    gender = 'Male';
    firstNameCandidate = normalizeWhitespace(firstNameCandidate.replace(/^BOY\s*/i, ''));
  } else if (/^GIRL\s*/i.test(firstNameCandidate)) {
    gender = 'Female';
    firstNameCandidate = normalizeWhitespace(firstNameCandidate.replace(/^GIRL\s*/i, ''));
  }

  return {
    rawName,
    firstName: firstNameCandidate || null,
    lastName: lastName || null,
    gender,
  };
}

export function parseStickerText(text: string): ParsedStickerData {
  const normalizedText = text
    .replace(/[|]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/\r/g, '\n');

  const lines = normalizedText
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const flattened = normalizeWhitespace(lines.join(' '));
  const nameData = parseName(lines);

  const dob = toIsoDate(extract(/DOB[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i, flattened));
  const mrn = extract(/M[#:]?\s*([0-9]{6,})/i, flattened);
  const account = extractAccount(flattened);
  const dateOfService = toIsoDate(extract(/DOS[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i, flattened));
  const location = extract(/LOC[:\s]*([A-Z]{2,10})/i, flattened);
  const age = extract(/Age[:\s]*([A-Z0-9]+)/i, flattened);

  const confidenceWarnings: string[] = [];

  if (!nameData.firstName || !nameData.lastName) {
    confidenceWarnings.push('Unable to confidently parse patient name from OCR output.');
  }
  if (!mrn) {
    confidenceWarnings.push('Unable to detect MRN from sticker.');
  }
  if (!dob) {
    confidenceWarnings.push('Unable to detect date of birth from sticker.');
  }

  return {
    ...nameData,
    dob,
    age,
    mrn,
    account,
    dateOfService,
    location,
    patientId: mrn || account || null,
    confidenceWarnings,
  };
}