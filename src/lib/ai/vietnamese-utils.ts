/**
 * Vietnamese Language Utilities
 * Text preprocessing, normalization, and abbreviation expansion
 */

// ===========================================
// VIETNAMESE ABBREVIATIONS DICTIONARY
// ===========================================

export const VIETNAMESE_ABBREVIATIONS: Record<string, string> = {
  // Pronouns & Addressing
  'e': 'em',
  'a': 'anh',
  'c': 'chi',
  'bn': 'ban',
  'cc': 'chi chi',
  'ac': 'anh chi',
  'ae': 'anh em',
  'ce': 'chi em',
  'mk': 'minh',
  'ms': 'moi nguoi',
  'mn': 'moi nguoi',
  'ng': 'nguoi',
  'nge': 'nghe',
  't': 'tao',
  'm': 'may',
  'b': 'ban',

  // Common words
  'k': 'khong',
  'ko': 'khong',
  'kg': 'khong',
  'hk': 'khong',
  'khg': 'khong',
  'dc': 'duoc',
  'dk': 'duoc',
  'r': 'roi',
  'rui': 'roi',
  'vs': 'voi',
  'trc': 'truoc',
  'trs': 'truoc',
  'ns': 'noi',
  'lm': 'lam',
  'bt': 'binh thuong',
  'bth': 'binh thuong',
  'nc': 'nuoc',
  'vn': 'Viet Nam',
  'sg': 'Sai Gon',
  'hn': 'Ha Noi',
  'dn': 'Da Nang',
  'hp': 'Hai Phong',
  'hcm': 'Ho Chi Minh',

  // Time
  'h': 'gio',
  'ph': 'phut',
  'hqua': 'hom qua',
  'hnay': 'hom nay',
  'hmai': 'hom mai',
  'ngmai': 'ngay mai',
  'thg': 'thang',
  'sn': 'sinh nhat',

  // Questions
  'j': 'gi',
  'z': 'gi',
  'ntn': 'nhu the nao',
  'lnao': 'lam sao',
  'bjo': 'bay gio',
  'bjh': 'bay gio',
  'bgio': 'bay gio',

  // Affirmations
  'ok': 'dong y',
  'oke': 'dong y',
  'okie': 'dong y',
  'oki': 'dong y',
  'uk': 'u',
  'uh': 'u',
  'uhm': 'um',
  'um': 'um',
  'vg': 'vang',

  // Negations
  'ch': 'chua',
  'cx': 'cung',
  'cg': 'cung',

  // Work related
  'cty': 'cong ty',
  'cv': 'cong viec',
  'pv': 'phong van',
  'gd': 'giam doc',
  'nv': 'nhan vien',
  'pb': 'phong ban',
  'bp': 'bo phan',
  'sp': 'san pham',
  'dv': 'dich vu',
  'hd': 'hop dong',
  'da': 'du an',
  'bc': 'bao cao',
  'dl': 'deadline',
  'ddl': 'deadline',
  'mtg': 'meeting',
  'kq': 'ket qua',
  'gt': 'gioi thieu',
  'tl': 'tra loi',
  'hs': 'ho so',

  // Finance
  'tk': 'tai khoan',
  'stk': 'so tai khoan',
  'ck': 'chuyen khoan',
  'tr': 'trieu',
  'ty': 'ty',
  'vnd': 'VND',
  'tt': 'thanh toan',

  // Communication
  'dt': 'dien thoai',
  'sdt': 'so dien thoai',
  'nt': 'nhan tin',
  'mess': 'tin nhan',
  'msg': 'tin nhan',
  'rep': 'tra loi',
  'fyi': 'de ban biet',
  'asap': 'cang som cang tot',
  'ib': 'inbox',

  // Gratitude & Politeness
  'tks': 'cam on',
  'thanks': 'cam on',
  'thks': 'cam on',
  'sr': 'xin loi',
  'sorry': 'xin loi',
  'sry': 'xin loi',
  'plz': 'lam on',
  'pls': 'lam on',

  // Internet slang
  'fb': 'Facebook',
  'ig': 'Instagram',
  'yt': 'YouTube',
  'gg': 'Google',
  'zl': 'Zalo',

  // Addresses
  'tp': 'thanh pho',
  'q': 'quan',
  'p': 'phuong',
  'tx': 'thi xa',

  // Misc
  'vd': 'vi du',
  'tgian': 'thoi gian',
  'ddia': 'dia diem',
  'info': 'thong tin',
};

// ===========================================
// VIETNAMESE STOPWORDS
// ===========================================

export const VIETNAMESE_STOPWORDS = new Set([
  'va', 'cua', 'co', 'la', 'duoc', 'cho', 'voi', 'cac',
  'trong', 'de', 'da', 'nay', 'khi', 'tu', 'theo', 've',
  'tai', 'nhu', 'cung', 'vao', 'nhung', 'hay', 'bi', 'thi',
  'ma', 'hoac', 'neu', 'vi', 'do', 'nen', 'se',
  'dang', 'rat', 'lai', 'con', 'ra', 'den', 'nhieu', 'it',
  'mot', 'hai', 'ba', 'bon', 'nam',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be',
  'to', 'of', 'and', 'in', 'that', 'have', 'for', 'on',
  'with', 'as', 'at', 'by', 'this', 'from', 'or', 'but',
]);

// ===========================================
// VIETNAMESE CHARACTER MAP (for diacritics removal)
// ===========================================

export const VIETNAMESE_CHAR_MAP: Record<string, string> = {
  // a with diacritics -> a
  '\u00e0': 'a', '\u00e1': 'a', '\u1ea3': 'a', '\u00e3': 'a', '\u1ea1': 'a',
  '\u0103': 'a', '\u1eb1': 'a', '\u1eaf': 'a', '\u1eb3': 'a', '\u1eb5': 'a', '\u1eb7': 'a',
  '\u00e2': 'a', '\u1ea7': 'a', '\u1ea5': 'a', '\u1ea9': 'a', '\u1eab': 'a', '\u1ead': 'a',
  '\u00c0': 'A', '\u00c1': 'A', '\u1ea2': 'A', '\u00c3': 'A', '\u1ea0': 'A',
  '\u0102': 'A', '\u1eb0': 'A', '\u1eae': 'A', '\u1eb2': 'A', '\u1eb4': 'A', '\u1eb6': 'A',
  '\u00c2': 'A', '\u1ea6': 'A', '\u1ea4': 'A', '\u1ea8': 'A', '\u1eaa': 'A', '\u1eac': 'A',
  // d with stroke -> d
  '\u0111': 'd', '\u0110': 'D',
  // e with diacritics -> e
  '\u00e8': 'e', '\u00e9': 'e', '\u1ebb': 'e', '\u1ebd': 'e', '\u1eb9': 'e',
  '\u00ea': 'e', '\u1ec1': 'e', '\u1ebf': 'e', '\u1ec3': 'e', '\u1ec5': 'e', '\u1ec7': 'e',
  '\u00c8': 'E', '\u00c9': 'E', '\u1eba': 'E', '\u1ebc': 'E', '\u1eb8': 'E',
  '\u00ca': 'E', '\u1ec0': 'E', '\u1ebe': 'E', '\u1ec2': 'E', '\u1ec4': 'E', '\u1ec6': 'E',
  // i with diacritics -> i
  '\u00ec': 'i', '\u00ed': 'i', '\u1ec9': 'i', '\u0129': 'i', '\u1ecb': 'i',
  '\u00cc': 'I', '\u00cd': 'I', '\u1ec8': 'I', '\u0128': 'I', '\u1eca': 'I',
  // o with diacritics -> o
  '\u00f2': 'o', '\u00f3': 'o', '\u1ecf': 'o', '\u00f5': 'o', '\u1ecd': 'o',
  '\u00f4': 'o', '\u1ed3': 'o', '\u1ed1': 'o', '\u1ed5': 'o', '\u1ed7': 'o', '\u1ed9': 'o',
  '\u01a1': 'o', '\u1edd': 'o', '\u1edb': 'o', '\u1edf': 'o', '\u1ee1': 'o', '\u1ee3': 'o',
  '\u00d2': 'O', '\u00d3': 'O', '\u1ece': 'O', '\u00d5': 'O', '\u1ecc': 'O',
  '\u00d4': 'O', '\u1ed2': 'O', '\u1ed0': 'O', '\u1ed4': 'O', '\u1ed6': 'O', '\u1ed8': 'O',
  '\u01a0': 'O', '\u1edc': 'O', '\u1eda': 'O', '\u1ede': 'O', '\u1ee0': 'O', '\u1ee2': 'O',
  // u with diacritics -> u
  '\u00f9': 'u', '\u00fa': 'u', '\u1ee7': 'u', '\u0169': 'u', '\u1ee5': 'u',
  '\u01b0': 'u', '\u1eeb': 'u', '\u1ee9': 'u', '\u1eed': 'u', '\u1eef': 'u', '\u1ef1': 'u',
  '\u00d9': 'U', '\u00da': 'U', '\u1ee6': 'U', '\u0168': 'U', '\u1ee4': 'U',
  '\u01af': 'U', '\u1eea': 'U', '\u1ee8': 'U', '\u1eec': 'U', '\u1eee': 'U', '\u1ef0': 'U',
  // y with diacritics -> y
  '\u1ef3': 'y', '\u00fd': 'y', '\u1ef7': 'y', '\u1ef9': 'y', '\u1ef5': 'y',
  '\u1ef2': 'Y', '\u00dd': 'Y', '\u1ef6': 'Y', '\u1ef8': 'Y', '\u1ef4': 'Y',
};

// Vietnamese character regex for detection
const VIETNAMESE_CHAR_REGEX = /[\u00c0-\u00c3\u00c8-\u00ca\u00cc-\u00cd\u00d2-\u00d5\u00d9-\u00da\u00dd\u00e0-\u00e3\u00e8-\u00ea\u00ec-\u00ed\u00f2-\u00f5\u00f9-\u00fa\u00fd\u0102-\u0103\u0110-\u0111\u0128-\u0129\u0168-\u0169\u01a0-\u01a1\u01af-\u01b0\u1ea0-\u1ef9]/;

// ===========================================
// TEXT NORMALIZATION
// ===========================================

/**
 * Remove Vietnamese diacritics - convert to ASCII
 */
export function toAscii(text: string): string {
  if (!text) return '';
  return text.split('').map(char => VIETNAMESE_CHAR_MAP[char] || char).join('');
}

/**
 * Normalize Vietnamese text for processing
 */
export function normalizeVietnameseText(text: string): string {
  if (!text) return '';

  let normalized = text;

  // Convert to lowercase
  normalized = normalized.toLowerCase();

  // Normalize unicode (NFC form)
  normalized = normalized.normalize('NFC');

  // Remove excessive whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Remove Vietnamese diacritics (alias for toAscii)
 */
export function removeVietnameseDiacritics(text: string): string {
  return toAscii(text);
}

// ===========================================
// ABBREVIATION EXPANSION
// ===========================================

/**
 * Expand Vietnamese abbreviations in text
 */
export function expandAbbreviations(text: string): string {
  if (!text) return '';

  // Split by whitespace and punctuation while preserving them
  const words = text.split(/(\s+|[.,!?;:])/);

  const expanded = words.map(word => {
    const lowerWord = word.toLowerCase().trim();

    // Skip empty strings and punctuation
    if (!lowerWord || /^[\s.,!?;:]+$/.test(word)) {
      return word;
    }

    // Check if it's an abbreviation
    const expansion = VIETNAMESE_ABBREVIATIONS[lowerWord];
    if (expansion) {
      // Preserve original case pattern
      if (word === word.toUpperCase()) {
        return expansion.toUpperCase();
      } else if (word[0] === word[0].toUpperCase()) {
        return expansion.charAt(0).toUpperCase() + expansion.slice(1);
      }
      return expansion;
    }

    return word;
  });

  return expanded.join('');
}

/**
 * Expand abbreviations with context awareness
 */
export function expandAbbreviationsWithContext(text: string): {
  original: string;
  expanded: string;
  expansions: Array<{ abbr: string; expanded: string; position: number }>;
} {
  const expansions: Array<{ abbr: string; expanded: string; position: number }> = [];

  const words = text.split(/(\s+)/);
  let position = 0;

  const expandedWords = words.map(word => {
    const lowerWord = word.toLowerCase().trim();
    const expansion = VIETNAMESE_ABBREVIATIONS[lowerWord];

    if (expansion && lowerWord !== expansion) {
      expansions.push({
        abbr: word,
        expanded: expansion,
        position,
      });
      position += word.length;
      return expansion;
    }

    position += word.length;
    return word;
  });

  return {
    original: text,
    expanded: expandedWords.join(''),
    expansions,
  };
}

// ===========================================
// LANGUAGE DETECTION
// ===========================================

/**
 * Detect if text is primarily Vietnamese
 */
export function isVietnamese(text: string): boolean {
  if (!text || text.length < 10) return false;

  // Check for Vietnamese characters
  const hasVietnameseChars = VIETNAMESE_CHAR_REGEX.test(text);

  // Common Vietnamese words (without diacritics for broader matching)
  const vietnameseWords = [
    'cua', 'va', 'la', 'duoc', 'cho', 'voi', 'cac', 'trong',
    'de', 'nay', 'khi', 'tu', 'theo', 've', 'tai', 'nhu',
    'anh', 'chi', 'em', 'ban', 'oi', 'nhe', 'nha',
    'xin', 'cam on', 'vui long', 'kinh', 'tran trong',
    'gui', 'nhan', 'biet', 'hieu', 'muon', 'can', 'phai',
  ];

  // Check for Vietnamese words
  const lowerText = toAscii(text.toLowerCase());
  const vietnameseWordCount = vietnameseWords.filter(word =>
    lowerText.includes(word)
  ).length;

  // Consider Vietnamese if has special chars OR multiple Vietnamese words
  return hasVietnameseChars || vietnameseWordCount >= 3;
}

/**
 * Get language confidence score
 */
export function getLanguageConfidence(text: string): {
  language: 'vi' | 'en' | 'mixed' | 'unknown';
  confidence: number;
  vietnameseRatio: number;
} {
  if (!text || text.length < 5) {
    return { language: 'unknown', confidence: 0, vietnameseRatio: 0 };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/).filter(w => w.length > 1);

  if (words.length === 0) {
    return { language: 'unknown', confidence: 0, vietnameseRatio: 0 };
  }

  // Vietnamese word indicators
  const vnWords = new Set(['cua', 'va', 'la', 'duoc', 'cho', 'voi', 'cac', 'trong', 'de', 'nay', 'khi', 'tu', 'theo', 've', 'tai', 'nhu', 'anh', 'chi', 'em', 'ban', 'oi', 'nhe', 'nha', 'xin', 'vui', 'long', 'kinh', 'tran', 'trong', 'thua', 'gui', 'nhan', 'biet', 'hieu', 'muon', 'can', 'phai', 'nen', 'se', 'da', 'dang', 'con', 'van', 'rat', 'nhieu', 'it', 'moi', 'cu']);

  // English word indicators
  const enWords = new Set(['the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also']);

  let vnScore = 0;
  let enScore = 0;

  for (const word of words) {
    const asciiWord = toAscii(word);
    if (VIETNAMESE_CHAR_REGEX.test(word)) vnScore += 2;
    if (vnWords.has(asciiWord)) vnScore += 1;
    if (enWords.has(word)) enScore += 1;
  }

  const totalScore = vnScore + enScore;
  const vietnameseRatio = totalScore > 0 ? vnScore / totalScore : 0;

  let language: 'vi' | 'en' | 'mixed' | 'unknown';
  let confidence: number;

  if (totalScore < 3) {
    language = 'unknown';
    confidence = 0.3;
  } else if (vietnameseRatio > 0.7) {
    language = 'vi';
    confidence = Math.min(0.95, 0.7 + vietnameseRatio * 0.25);
  } else if (vietnameseRatio < 0.3) {
    language = 'en';
    confidence = Math.min(0.95, 0.7 + (1 - vietnameseRatio) * 0.25);
  } else {
    language = 'mixed';
    confidence = 0.6;
  }

  return { language, confidence, vietnameseRatio };
}

// ===========================================
// TEXT EXTRACTION & CLEANING
// ===========================================

/**
 * Extract clean text from email body (remove HTML, signatures, etc.)
 */
export function cleanEmailBody(body: string): string {
  if (!body) return '';

  let cleaned = body;

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[LINK]');

  // Remove email addresses in body
  cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // Remove phone numbers (Vietnamese format)
  cleaned = cleaned.replace(/(\+84|84|0)[0-9]{9,10}/g, '[PHONE]');

  // Common email signature indicators
  const signaturePatterns = [
    /^--\s*$/m,
    /^Tran trong,?\s*$/mi,
    /^Best regards,?\s*$/mi,
    /^Thanks,?\s*$/mi,
    /^Regards,?\s*$/mi,
    /^Sent from my iPhone/mi,
    /^Sent from my Samsung/mi,
    /^Duoc gui tu/mi,
    /^Cam on,?\s*$/mi,
  ];

  for (const pattern of signaturePatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      cleaned = cleaned.substring(0, match.index);
    }
  }

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove excessive line breaks
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

/**
 * Extract key phrases from Vietnamese text
 */
export function extractKeyPhrases(text: string, maxPhrases: number = 10): string[] {
  if (!text) return [];

  const cleaned = cleanEmailBody(text);
  const words = toAscii(cleaned.toLowerCase()).split(/\s+/);

  // Remove stopwords
  const meaningfulWords = words.filter(word =>
    word.length > 2 && !VIETNAMESE_STOPWORDS.has(word)
  );

  // Count word frequency
  const wordFreq = new Map<string, number>();
  for (const word of meaningfulWords) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  // Sort by frequency and return top phrases
  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPhrases)
    .map(([word]) => word);
}

// ===========================================
// FORMALITY DETECTION
// ===========================================

/**
 * Detect formality level of Vietnamese text
 */
export function detectFormality(text: string): {
  level: 'formal' | 'semi-formal' | 'informal';
  confidence: number;
  indicators: string[];
} {
  const asciiText = toAscii(text.toLowerCase());
  const indicators: string[] = [];

  // Formal indicators
  const formalPatterns = [
    { pattern: /kinh gui/i, weight: 3, label: 'Kinh gui' },
    { pattern: /tran trong/i, weight: 3, label: 'Tran trong' },
    { pattern: /thua\s+(ong|ba|anh|chi|quy)/i, weight: 3, label: 'Thua...' },
    { pattern: /xin\s+(chao|phep|gui)/i, weight: 2, label: 'Xin...' },
    { pattern: /vui\s+long/i, weight: 2, label: 'Vui long' },
    { pattern: /kinh\s+(mong|de nghi)/i, weight: 2, label: 'Kinh...' },
    { pattern: /quy\s+(khach|cong ty|doi tac)/i, weight: 2, label: 'Quy...' },
    { pattern: /best\s+regards/i, weight: 2, label: 'Best regards' },
    { pattern: /dear\s+/i, weight: 2, label: 'Dear' },
    { pattern: /sincerely/i, weight: 2, label: 'Sincerely' },
  ];

  // Informal indicators
  const informalPatterns = [
    { pattern: /\boi\b/i, weight: -2, label: 'oi' },
    { pattern: /\bnha\b/i, weight: -2, label: 'nha' },
    { pattern: /\bnhe\b/i, weight: -2, label: 'nhe' },
    { pattern: /\bhen\b/i, weight: -2, label: 'hen' },
    { pattern: /\bha\b/i, weight: -1, label: 'ha' },
    { pattern: /\bhihi\b|\bhaha\b/i, weight: -2, label: 'hihi/haha' },
    { pattern: /:\)|:D|<3/i, weight: -1, label: 'emoticons' },
    { pattern: /\b(e|a|c)\s+(oi|ne)/i, weight: -2, label: 'e/a/c oi' },
    { pattern: /\bko\b|\bk\b|\bdc\b|\br\b/i, weight: -1, label: 'abbreviations' },
    { pattern: /\bhjhj\b|\bkk\b/i, weight: -2, label: 'slang laughs' },
  ];

  let formalityScore = 0;

  for (const { pattern, weight, label } of formalPatterns) {
    if (pattern.test(asciiText)) {
      formalityScore += weight;
      indicators.push(label);
    }
  }

  for (const { pattern, weight, label } of informalPatterns) {
    if (pattern.test(asciiText)) {
      formalityScore += weight;
      indicators.push(label);
    }
  }

  let level: 'formal' | 'semi-formal' | 'informal';
  let confidence: number;

  if (formalityScore >= 4) {
    level = 'formal';
    confidence = Math.min(0.95, 0.7 + formalityScore * 0.05);
  } else if (formalityScore <= -3) {
    level = 'informal';
    confidence = Math.min(0.95, 0.7 + Math.abs(formalityScore) * 0.05);
  } else {
    level = 'semi-formal';
    confidence = 0.6;
  }

  return { level, confidence, indicators };
}

// ===========================================
// MONEY/AMOUNT EXTRACTION
// ===========================================

/**
 * Extract monetary amounts from Vietnamese text
 */
export function extractMoneyAmounts(text: string): Array<{
  original: string;
  amount: number;
  currency: string;
}> {
  const amounts: Array<{ original: string; amount: number; currency: string }> = [];

  // Vietnamese money patterns
  const patterns = [
    // 1,000,000 VND or 1.000.000 VND or 1000000đ
    { regex: /(\d{1,3}(?:[.,]\d{3})*)\s*(?:VND|vnd|VN\u0110|vn\u0111|\u0111|d|dong|\u0111\u1ed3ng)/gi, multiplier: 1 },
    // 1tr, 1 trieu, 1 triệu
    { regex: /(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|tri\u1ec7u)/gi, multiplier: 1000000 },
    // 1ty, 1 ty, 1 tỷ
    { regex: /(\d+(?:[.,]\d+)?)\s*(?:ty|t\u1ef7)/gi, multiplier: 1000000000 },
    // 1k, 1K (thousand)
    { regex: /(\d+)\s*k\b/gi, multiplier: 1000 },
  ];

  for (const { regex, multiplier } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      const numStr = match[1].replace(/[.,]/g, '');
      const num = parseFloat(numStr) || 0;
      const amount = num * multiplier;

      if (amount > 0) {
        amounts.push({ original, amount, currency: 'VND' });
      }
    }
  }

  // USD pattern
  const usdPattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*\$/gi;
  let usdMatch;
  while ((usdMatch = usdPattern.exec(text)) !== null) {
    const original = usdMatch[0];
    const numStr = (usdMatch[1] || usdMatch[2] || '').replace(/,/g, '');
    const amount = parseFloat(numStr) || 0;
    if (amount > 0) {
      amounts.push({ original, amount, currency: 'USD' });
    }
  }

  return amounts;
}

// ===========================================
// PREPROCESS PIPELINE
// ===========================================

export interface PreprocessedEmail {
  originalSubject: string;
  originalBody: string;
  cleanedBody: string;
  expandedSubject: string;
  expandedBody: string;
  language: {
    detected: 'vi' | 'en' | 'mixed' | 'unknown';
    confidence: number;
    vietnameseRatio: number;
  };
  formality: {
    level: 'formal' | 'semi-formal' | 'informal';
    confidence: number;
    indicators: string[];
  };
  keyPhrases: string[];
  abbreviationsFound: Array<{ abbr: string; expanded: string; position: number }>;
  moneyAmounts: Array<{ original: string; amount: number; currency: string }>;
}

/**
 * Full preprocessing pipeline for email
 */
export function preprocessEmail(
  subject: string,
  body: string
): PreprocessedEmail {
  // Clean body
  const cleanedBody = cleanEmailBody(body);

  // Expand abbreviations
  const expandedSubjectResult = expandAbbreviationsWithContext(subject);
  const expandedBodyResult = expandAbbreviationsWithContext(cleanedBody);

  // Detect language
  const combinedText = `${subject} ${cleanedBody}`;
  const langResult = getLanguageConfidence(combinedText);

  // Detect formality
  const formality = detectFormality(combinedText);

  // Extract key phrases
  const keyPhrases = extractKeyPhrases(cleanedBody);

  // Extract money amounts
  const moneyAmounts = extractMoneyAmounts(combinedText);

  return {
    originalSubject: subject,
    originalBody: body,
    cleanedBody,
    expandedSubject: expandedSubjectResult.expanded,
    expandedBody: expandedBodyResult.expanded,
    language: {
      detected: langResult.language,
      confidence: langResult.confidence,
      vietnameseRatio: langResult.vietnameseRatio,
    },
    formality,
    keyPhrases,
    abbreviationsFound: [
      ...expandedSubjectResult.expansions,
      ...expandedBodyResult.expansions,
    ],
    moneyAmounts,
  };
}

// ===========================================
// EXPORTS
// ===========================================

export default {
  normalizeVietnameseText,
  removeVietnameseDiacritics,
  toAscii,
  expandAbbreviations,
  expandAbbreviationsWithContext,
  isVietnamese,
  getLanguageConfidence,
  cleanEmailBody,
  extractKeyPhrases,
  detectFormality,
  extractMoneyAmounts,
  preprocessEmail,
  VIETNAMESE_ABBREVIATIONS,
  VIETNAMESE_STOPWORDS,
  VIETNAMESE_CHAR_MAP,
};
