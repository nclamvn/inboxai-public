/**
 * Vietnamese Entity Recognition
 * Detect brands, banks, services, and named entities in Vietnamese emails
 */

// ===========================================
// VIETNAMESE BANKS
// ===========================================

export interface BankInfo {
  name: string;
  shortName: string;
  aliases: string[];
  domains: string[];
  category: 'state' | 'private' | 'foreign';
}

export const VIETNAMESE_BANKS: Record<string, BankInfo> = {
  // State-owned banks
  'vietcombank': {
    name: 'Ngan hang TMCP Ngoai thuong Viet Nam',
    shortName: 'Vietcombank',
    aliases: ['vcb', 'vietcombank', 'ngoai thuong'],
    domains: ['vietcombank.com.vn'],
    category: 'state',
  },
  'vietinbank': {
    name: 'Ngan hang TMCP Cong thuong Viet Nam',
    shortName: 'VietinBank',
    aliases: ['ctg', 'vietinbank', 'cong thuong', 'viettinbank'],
    domains: ['vietinbank.vn'],
    category: 'state',
  },
  'bidv': {
    name: 'Ngan hang TMCP Dau tu va Phat trien Viet Nam',
    shortName: 'BIDV',
    aliases: ['bidv', 'dau tu phat trien'],
    domains: ['bidv.com.vn'],
    category: 'state',
  },
  'agribank': {
    name: 'Ngan hang Nong nghiep va Phat trien Nong thon Viet Nam',
    shortName: 'Agribank',
    aliases: ['agribank', 'nong nghiep', 'agri'],
    domains: ['agribank.com.vn'],
    category: 'state',
  },

  // Private banks
  'techcombank': {
    name: 'Ngan hang TMCP Ky thuong Viet Nam',
    shortName: 'Techcombank',
    aliases: ['tcb', 'techcombank', 'ky thuong'],
    domains: ['techcombank.com.vn'],
    category: 'private',
  },
  'mbbank': {
    name: 'Ngan hang TMCP Quan doi',
    shortName: 'MB Bank',
    aliases: ['mb', 'mbbank', 'mb bank', 'quan doi', 'military'],
    domains: ['mbbank.com.vn'],
    category: 'private',
  },
  'vpbank': {
    name: 'Ngan hang TMCP Viet Nam Thinh Vuong',
    shortName: 'VPBank',
    aliases: ['vpb', 'vpbank', 'vp bank', 'thinh vuong'],
    domains: ['vpbank.com.vn'],
    category: 'private',
  },
  'acb': {
    name: 'Ngan hang TMCP A Chau',
    shortName: 'ACB',
    aliases: ['acb', 'a chau', 'asia commercial'],
    domains: ['acb.com.vn'],
    category: 'private',
  },
  'sacombank': {
    name: 'Ngan hang TMCP Sai Gon Thuong Tin',
    shortName: 'Sacombank',
    aliases: ['stb', 'sacombank', 'sai gon thuong tin'],
    domains: ['sacombank.com.vn'],
    category: 'private',
  },
  'tpbank': {
    name: 'Ngan hang TMCP Tien Phong',
    shortName: 'TPBank',
    aliases: ['tpb', 'tpbank', 'tp bank', 'tien phong'],
    domains: ['tpbank.vn'],
    category: 'private',
  },
  'hdbank': {
    name: 'Ngan hang TMCP Phat trien TP.HCM',
    shortName: 'HDBank',
    aliases: ['hdb', 'hdbank', 'hd bank'],
    domains: ['hdbank.com.vn'],
    category: 'private',
  },
  'vib': {
    name: 'Ngan hang TMCP Quoc te Viet Nam',
    shortName: 'VIB',
    aliases: ['vib', 'quoc te', 'vietnam international'],
    domains: ['vib.com.vn'],
    category: 'private',
  },
  'ocb': {
    name: 'Ngan hang TMCP Phuong Dong',
    shortName: 'OCB',
    aliases: ['ocb', 'phuong dong', 'orient'],
    domains: ['ocb.com.vn'],
    category: 'private',
  },
  'msb': {
    name: 'Ngan hang TMCP Hang Hai Viet Nam',
    shortName: 'MSB',
    aliases: ['msb', 'hang hai', 'maritime'],
    domains: ['msb.com.vn'],
    category: 'private',
  },
  'shb': {
    name: 'Ngan hang TMCP Sai Gon - Ha Noi',
    shortName: 'SHB',
    aliases: ['shb', 'sai gon ha noi'],
    domains: ['shb.com.vn'],
    category: 'private',
  },
  'eximbank': {
    name: 'Ngan hang TMCP Xuat Nhap khau Viet Nam',
    shortName: 'Eximbank',
    aliases: ['eib', 'eximbank', 'xuat nhap khau'],
    domains: ['eximbank.com.vn'],
    category: 'private',
  },
  'seabank': {
    name: 'Ngan hang TMCP Dong Nam A',
    shortName: 'SeABank',
    aliases: ['seabank', 'sea bank', 'dong nam a'],
    domains: ['seabank.com.vn'],
    category: 'private',
  },
  'lienvietpostbank': {
    name: 'Ngan hang TMCP Buu dien Lien Viet',
    shortName: 'LienVietPostBank',
    aliases: ['lpb', 'lienviet', 'lien viet', 'buu dien lien viet'],
    domains: ['lienvietpostbank.com.vn'],
    category: 'private',
  },
  'ncb': {
    name: 'Ngan hang TMCP Quoc Dan',
    shortName: 'NCB',
    aliases: ['ncb', 'quoc dan', 'national citizen'],
    domains: ['ncb-bank.vn'],
    category: 'private',
  },
  'baovietbank': {
    name: 'Ngan hang TMCP Bao Viet',
    shortName: 'BaoVietBank',
    aliases: ['bvb', 'baoviet', 'bao viet'],
    domains: ['baovietbank.vn'],
    category: 'private',
  },
  'pvcombank': {
    name: 'Ngan hang TMCP Dai Chung Viet Nam',
    shortName: 'PVcomBank',
    aliases: ['pvcombank', 'pv', 'dai chung'],
    domains: ['pvcombank.com.vn'],
    category: 'private',
  },
};

// ===========================================
// E-WALLETS & FINTECH
// ===========================================

export interface EWalletInfo {
  name: string;
  aliases: string[];
  domains: string[];
}

export const VIETNAMESE_EWALLETS: Record<string, EWalletInfo> = {
  'momo': {
    name: 'MoMo',
    aliases: ['momo', 'mo mo', 'vi momo'],
    domains: ['momo.vn'],
  },
  'zalopay': {
    name: 'ZaloPay',
    aliases: ['zalopay', 'zalo pay', 'vi zalo'],
    domains: ['zalopay.vn'],
  },
  'vnpay': {
    name: 'VNPay',
    aliases: ['vnpay', 'vn pay', 'vnpay qr'],
    domains: ['vnpay.vn'],
  },
  'shopeepay': {
    name: 'ShopeePay',
    aliases: ['shopeepay', 'shopee pay', 'vi shopee', 'airpay'],
    domains: ['shopeepay.vn'],
  },
  'viettelmoney': {
    name: 'Viettel Money',
    aliases: ['viettel money', 'viettel pay', 'viettelpay'],
    domains: ['viettelmoney.vn'],
  },
  'vnptpay': {
    name: 'VNPT Pay',
    aliases: ['vnpt pay', 'vnptpay', 'vi vnpt'],
    domains: ['vnptpay.vn'],
  },
  'payoo': {
    name: 'Payoo',
    aliases: ['payoo'],
    domains: ['payoo.vn'],
  },
};

// ===========================================
// E-COMMERCE PLATFORMS
// ===========================================

export interface ECommerceInfo {
  name: string;
  shortName?: string;
  aliases: string[];
  domains: string[];
  category: 'marketplace' | 'retail' | 'grocery';
}

export const VIETNAMESE_ECOMMERCE: Record<string, ECommerceInfo> = {
  'shopee': {
    name: 'Shopee',
    aliases: ['shopee', 'shoppee', 'sopi'],
    domains: ['shopee.vn'],
    category: 'marketplace',
  },
  'lazada': {
    name: 'Lazada',
    aliases: ['lazada', 'laz'],
    domains: ['lazada.vn'],
    category: 'marketplace',
  },
  'tiki': {
    name: 'Tiki',
    aliases: ['tiki'],
    domains: ['tiki.vn'],
    category: 'marketplace',
  },
  'sendo': {
    name: 'Sendo',
    aliases: ['sendo', 'sen do'],
    domains: ['sendo.vn'],
    category: 'marketplace',
  },
  'tgdd': {
    name: 'The Gioi Di Dong',
    shortName: 'TGDD',
    aliases: ['the gioi di dong', 'tgdd'],
    domains: ['thegioididong.com'],
    category: 'retail',
  },
  'dienmayxanh': {
    name: 'Dien May Xanh',
    aliases: ['dien may xanh', 'dmx'],
    domains: ['dienmayxanh.com'],
    category: 'retail',
  },
  'fptshop': {
    name: 'FPT Shop',
    aliases: ['fpt shop', 'fptshop'],
    domains: ['fptshop.com.vn'],
    category: 'retail',
  },
  'cellphones': {
    name: 'CellphoneS',
    aliases: ['cellphones', 'cellphone s', 'cps'],
    domains: ['cellphones.com.vn'],
    category: 'retail',
  },
  'bachhoaxanh': {
    name: 'Bach Hoa Xanh',
    aliases: ['bach hoa xanh', 'bhx'],
    domains: ['bachhoaxanh.com'],
    category: 'grocery',
  },
  'winmart': {
    name: 'WinMart',
    aliases: ['winmart', 'vinmart', 'win mart'],
    domains: ['winmart.vn'],
    category: 'grocery',
  },
};

// ===========================================
// DELIVERY & RIDE-HAILING
// ===========================================

export interface DeliveryServiceInfo {
  name: string;
  aliases: string[];
  domains: string[];
  services: string[];
}

export const VIETNAMESE_DELIVERY: Record<string, DeliveryServiceInfo> = {
  'grab': {
    name: 'Grab',
    aliases: ['grab', 'grabcar', 'grabbike', 'grabfood', 'grabexpress'],
    domains: ['grab.com'],
    services: ['ride', 'food', 'delivery'],
  },
  'be': {
    name: 'Be',
    aliases: ['be', 'be group', 'bebike', 'becar', 'befood'],
    domains: ['be.com.vn'],
    services: ['ride', 'food'],
  },
  'gojek': {
    name: 'Gojek',
    aliases: ['gojek', 'go-jek', 'goviet', 'gocar', 'gobike', 'gofood'],
    domains: ['gojek.com'],
    services: ['ride', 'food', 'delivery'],
  },
  'shopeefood': {
    name: 'ShopeeFood',
    aliases: ['shopeefood', 'shopee food', 'now'],
    domains: ['shopeefood.vn'],
    services: ['food'],
  },
  'loship': {
    name: 'Loship',
    aliases: ['loship', 'lo ship'],
    domains: ['loship.vn'],
    services: ['food', 'delivery'],
  },
  'ghn': {
    name: 'Giao Hang Nhanh',
    aliases: ['ghn', 'giao hang nhanh'],
    domains: ['ghn.vn'],
    services: ['delivery'],
  },
  'ghtk': {
    name: 'Giao Hang Tiet Kiem',
    aliases: ['ghtk', 'giao hang tiet kiem'],
    domains: ['giaohangtietkiem.vn'],
    services: ['delivery'],
  },
  'jt': {
    name: 'J&T Express',
    aliases: ['j&t', 'jt', 'j&t express', 'jt express'],
    domains: ['jtexpress.vn'],
    services: ['delivery'],
  },
  'viettelpost': {
    name: 'Viettel Post',
    aliases: ['viettel post', 'viettelpost'],
    domains: ['viettelpost.vn'],
    services: ['delivery'],
  },
  'vnpost': {
    name: 'Vietnam Post',
    aliases: ['vnpost', 'vietnam post', 'buu dien', 'ems'],
    domains: ['vnpost.vn'],
    services: ['delivery'],
  },
};

// ===========================================
// TRAVEL & AIRLINES
// ===========================================

export interface TravelServiceInfo {
  name: string;
  aliases: string[];
  domains: string[];
  type: 'airline' | 'booking' | 'hotel';
}

export const VIETNAMESE_TRAVEL: Record<string, TravelServiceInfo> = {
  'vietnamairlines': {
    name: 'Vietnam Airlines',
    aliases: ['vietnam airlines', 'vna', 'hang khong viet nam'],
    domains: ['vietnamairlines.com'],
    type: 'airline',
  },
  'vietjet': {
    name: 'VietJet Air',
    aliases: ['vietjet', 'vietjet air', 'vj'],
    domains: ['vietjetair.com'],
    type: 'airline',
  },
  'bamboo': {
    name: 'Bamboo Airways',
    aliases: ['bamboo', 'bamboo airways'],
    domains: ['bambooairways.com'],
    type: 'airline',
  },
  'traveloka': {
    name: 'Traveloka',
    aliases: ['traveloka'],
    domains: ['traveloka.com'],
    type: 'booking',
  },
  'agoda': {
    name: 'Agoda',
    aliases: ['agoda'],
    domains: ['agoda.com'],
    type: 'booking',
  },
  'booking': {
    name: 'Booking.com',
    aliases: ['booking', 'booking.com'],
    domains: ['booking.com'],
    type: 'booking',
  },
  'vinpearl': {
    name: 'Vinpearl',
    aliases: ['vinpearl', 'vin pearl'],
    domains: ['vinpearl.com'],
    type: 'hotel',
  },
};

// ===========================================
// TELECOM & UTILITIES
// ===========================================

export interface TelecomInfo {
  name: string;
  aliases: string[];
  domains: string[];
}

export const VIETNAMESE_TELECOM: Record<string, TelecomInfo> = {
  'viettel': {
    name: 'Viettel',
    aliases: ['viettel', 'viettel telecom'],
    domains: ['viettel.com.vn'],
  },
  'vnpt': {
    name: 'VNPT',
    aliases: ['vnpt', 'vinaphone', 'vina'],
    domains: ['vnpt.com.vn', 'vinaphone.com.vn'],
  },
  'mobifone': {
    name: 'MobiFone',
    aliases: ['mobifone', 'mobi'],
    domains: ['mobifone.vn'],
  },
  'fpt': {
    name: 'FPT Telecom',
    aliases: ['fpt', 'fpt telecom', 'fpt internet'],
    domains: ['fpt.vn', 'fpt.com.vn'],
  },
  'evn': {
    name: 'EVN',
    aliases: ['evn', 'dien luc', 'evnhcmc', 'evnhanoi'],
    domains: ['evn.com.vn'],
  },
};

// ===========================================
// GOVERNMENT SERVICES
// ===========================================

export interface GovServiceInfo {
  name: string;
  aliases: string[];
  domains: string[];
}

export const VIETNAMESE_GOVERNMENT: Record<string, GovServiceInfo> = {
  'dichvucong': {
    name: 'Dich vu cong quoc gia',
    aliases: ['dich vu cong', 'cong dich vu cong'],
    domains: ['dichvucong.gov.vn'],
  },
  'bhxh': {
    name: 'Bao hiem xa hoi',
    aliases: ['bhxh', 'bao hiem xa hoi'],
    domains: ['baohiemxahoi.gov.vn'],
  },
  'thue': {
    name: 'Tong cuc thue',
    aliases: ['thue', 'tong cuc thue', 'cuc thue'],
    domains: ['gdt.gov.vn'],
  },
  'congantphcm': {
    name: 'Cong an TP.HCM',
    aliases: ['cong an'],
    domains: ['congan.hochiminhcity.gov.vn'],
  },
};

// ===========================================
// SOCIAL MEDIA
// ===========================================

export interface SocialMediaInfo {
  name: string;
  aliases: string[];
  domains: string[];
}

export const SOCIAL_MEDIA: Record<string, SocialMediaInfo> = {
  'facebook': {
    name: 'Facebook',
    aliases: ['facebook', 'fb', 'face'],
    domains: ['facebook.com', 'fb.com'],
  },
  'instagram': {
    name: 'Instagram',
    aliases: ['instagram', 'ig', 'insta'],
    domains: ['instagram.com'],
  },
  'tiktok': {
    name: 'TikTok',
    aliases: ['tiktok', 'tik tok'],
    domains: ['tiktok.com'],
  },
  'youtube': {
    name: 'YouTube',
    aliases: ['youtube', 'yt'],
    domains: ['youtube.com', 'youtu.be'],
  },
  'zalo': {
    name: 'Zalo',
    aliases: ['zalo', 'zl'],
    domains: ['zalo.me', 'zalo.vn'],
  },
  'linkedin': {
    name: 'LinkedIn',
    aliases: ['linkedin', 'linked in'],
    domains: ['linkedin.com'],
  },
  'twitter': {
    name: 'Twitter/X',
    aliases: ['twitter', 'x', 'tweet'],
    domains: ['twitter.com', 'x.com'],
  },
};

// ===========================================
// ENTITY DETECTION TYPES
// ===========================================

export type EntityType = 'bank' | 'ewallet' | 'ecommerce' | 'delivery' | 'travel' | 'telecom' | 'government' | 'social';

export interface DetectedEntity {
  type: EntityType;
  key: string;
  name: string;
  confidence: number;
  matchedText: string;
  position: number;
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===========================================
// ENTITY DETECTION FUNCTIONS
// ===========================================

/**
 * Detect all Vietnamese entities in text
 */
export function detectEntities(text: string): DetectedEntity[] {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const entities: DetectedEntity[] = [];

  // Helper function to search in a category
  const searchInCategory = (
    category: Record<string, { name: string; aliases: string[]; domains?: string[] }>,
    type: EntityType
  ) => {
    for (const [key, info] of Object.entries(category)) {
      // Check aliases
      for (const alias of info.aliases) {
        const regex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'gi');
        let match;
        while ((match = regex.exec(lowerText)) !== null) {
          // Avoid duplicates at same position
          const existing = entities.find(e =>
            e.position === match!.index && e.key === key
          );
          if (!existing) {
            entities.push({
              type,
              key,
              name: info.name,
              confidence: alias.length > 3 ? 0.95 : 0.8,
              matchedText: match[0],
              position: match.index,
            });
          }
        }
      }

      // Check domains
      if (info.domains) {
        for (const domain of info.domains) {
          if (lowerText.includes(domain)) {
            const position = lowerText.indexOf(domain);
            const existing = entities.find(e =>
              e.position === position && e.key === key
            );
            if (!existing) {
              entities.push({
                type,
                key,
                name: info.name,
                confidence: 0.99,
                matchedText: domain,
                position,
              });
            }
          }
        }
      }
    }
  };

  // Search all categories
  searchInCategory(VIETNAMESE_BANKS, 'bank');
  searchInCategory(VIETNAMESE_EWALLETS, 'ewallet');
  searchInCategory(VIETNAMESE_ECOMMERCE, 'ecommerce');
  searchInCategory(VIETNAMESE_DELIVERY, 'delivery');
  searchInCategory(VIETNAMESE_TRAVEL, 'travel');
  searchInCategory(VIETNAMESE_TELECOM, 'telecom');
  searchInCategory(VIETNAMESE_GOVERNMENT, 'government');
  searchInCategory(SOCIAL_MEDIA, 'social');

  // Sort by position
  entities.sort((a, b) => a.position - b.position);

  // Remove duplicates (keep highest confidence)
  const uniqueEntities: DetectedEntity[] = [];
  for (const entity of entities) {
    const existing = uniqueEntities.find(e =>
      e.key === entity.key && Math.abs(e.position - entity.position) < 20
    );
    if (!existing) {
      uniqueEntities.push(entity);
    } else if (entity.confidence > existing.confidence) {
      const index = uniqueEntities.indexOf(existing);
      uniqueEntities[index] = entity;
    }
  }

  return uniqueEntities;
}

/**
 * Detect banks specifically (for transaction classification)
 */
export function detectBanks(text: string): Array<{ key: string; info: BankInfo; confidence: number }> {
  const entities = detectEntities(text);
  return entities
    .filter(e => e.type === 'bank')
    .map(e => ({
      key: e.key,
      info: VIETNAMESE_BANKS[e.key],
      confidence: e.confidence,
    }));
}

/**
 * Detect e-wallets specifically
 */
export function detectEWallets(text: string): Array<{ key: string; info: EWalletInfo; confidence: number }> {
  const entities = detectEntities(text);
  return entities
    .filter(e => e.type === 'ewallet')
    .map(e => ({
      key: e.key,
      info: VIETNAMESE_EWALLETS[e.key],
      confidence: e.confidence,
    }));
}

/**
 * Detect e-commerce platforms
 */
export function detectECommerce(text: string): Array<{ key: string; info: ECommerceInfo; confidence: number }> {
  const entities = detectEntities(text);
  return entities
    .filter(e => e.type === 'ecommerce')
    .map(e => ({
      key: e.key,
      info: VIETNAMESE_ECOMMERCE[e.key],
      confidence: e.confidence,
    }));
}

/**
 * Check if sender domain belongs to a known entity
 */
export function identifySenderEntity(senderDomain: string): {
  type: EntityType | 'unknown';
  key: string | null;
  name: string | null;
  isLegitimate: boolean;
} {
  const lowerDomain = senderDomain.toLowerCase();

  // Check all categories
  const categories: Array<{ data: Record<string, { name: string; domains?: string[] }>; type: EntityType }> = [
    { data: VIETNAMESE_BANKS, type: 'bank' },
    { data: VIETNAMESE_EWALLETS, type: 'ewallet' },
    { data: VIETNAMESE_ECOMMERCE, type: 'ecommerce' },
    { data: VIETNAMESE_DELIVERY, type: 'delivery' },
    { data: VIETNAMESE_TRAVEL, type: 'travel' },
    { data: VIETNAMESE_TELECOM, type: 'telecom' },
    { data: VIETNAMESE_GOVERNMENT, type: 'government' },
    { data: SOCIAL_MEDIA, type: 'social' },
  ];

  for (const { data, type } of categories) {
    for (const [key, info] of Object.entries(data)) {
      if ('domains' in info && info.domains) {
        for (const domain of info.domains) {
          if (lowerDomain === domain || lowerDomain.endsWith('.' + domain)) {
            return {
              type,
              key,
              name: info.name,
              isLegitimate: true,
            };
          }
        }
      }
    }
  }

  return {
    type: 'unknown',
    key: null,
    name: null,
    isLegitimate: false,
  };
}

// ===========================================
// MONEY AMOUNT DETECTION
// ===========================================

export interface MoneyAmount {
  amount: number;
  currency: string;
  originalText: string;
  position: number;
}

/**
 * Detect money amounts in Vietnamese text
 */
export function detectMoneyAmounts(text: string): MoneyAmount[] {
  const amounts: MoneyAmount[] = [];

  // Vietnamese money patterns
  const patterns: Array<{ regex: RegExp; multiplier: number; currency: string }> = [
    // 1,000,000 VND or 1.000.000 VND or 1000000d
    { regex: /(\d{1,3}(?:[.,]\d{3})*)\s*(?:vnd|vn\u0111|dong|\u0111\u1ed3ng|\u0111|d)\b/gi, multiplier: 1, currency: 'VND' },
    // 1tr, 1 trieu
    { regex: /(\d+(?:[.,]\d+)?)\s*(?:tr|trieu|tri\u1ec7u)\b/gi, multiplier: 1000000, currency: 'VND' },
    // 1ty, 1 ty
    { regex: /(\d+(?:[.,]\d+)?)\s*(?:ty|t\u1ef7)\b/gi, multiplier: 1000000000, currency: 'VND' },
    // 1k, 1K (thousand)
    { regex: /(\d+(?:[.,]\d+)?)\s*k\b/gi, multiplier: 1000, currency: 'VND' },
  ];

  for (const { regex, multiplier, currency } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const numStr = match[1].replace(/[.,]/g, '');
      const num = parseFloat(numStr);
      const amount = num * multiplier;

      if (!isNaN(amount) && amount > 0) {
        amounts.push({
          amount,
          currency,
          originalText: fullMatch,
          position: match.index,
        });
      }
    }
  }

  // USD pattern
  const usdPattern = /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*\$/gi;
  let usdMatch;
  while ((usdMatch = usdPattern.exec(text)) !== null) {
    const fullMatch = usdMatch[0];
    const numStr = (usdMatch[1] || usdMatch[2] || '').replace(/,/g, '');
    const amount = parseFloat(numStr);
    if (!isNaN(amount) && amount > 0) {
      amounts.push({
        amount,
        currency: 'USD',
        originalText: fullMatch,
        position: usdMatch.index,
      });
    }
  }

  return amounts;
}

// ===========================================
// PHONE NUMBER DETECTION
// ===========================================

export interface PhoneNumber {
  number: string;
  formatted: string;
  type: 'mobile' | 'landline' | 'hotline' | 'unknown';
  carrier?: string;
  position: number;
}

const VIETNAMESE_MOBILE_PREFIXES: Record<string, string> = {
  // Viettel
  '086': 'Viettel', '096': 'Viettel', '097': 'Viettel', '098': 'Viettel',
  '032': 'Viettel', '033': 'Viettel', '034': 'Viettel', '035': 'Viettel',
  '036': 'Viettel', '037': 'Viettel', '038': 'Viettel', '039': 'Viettel',
  // Vinaphone
  '088': 'Vinaphone', '091': 'Vinaphone', '094': 'Vinaphone',
  '081': 'Vinaphone', '082': 'Vinaphone', '083': 'Vinaphone', '084': 'Vinaphone', '085': 'Vinaphone',
  // Mobifone
  '089': 'Mobifone', '090': 'Mobifone', '093': 'Mobifone',
  '070': 'Mobifone', '076': 'Mobifone', '077': 'Mobifone', '078': 'Mobifone', '079': 'Mobifone',
  // Vietnamobile
  '092': 'Vietnamobile', '056': 'Vietnamobile', '058': 'Vietnamobile',
  // Gmobile
  '099': 'Gmobile', '059': 'Gmobile',
};

/**
 * Detect Vietnamese phone numbers
 */
export function detectPhoneNumbers(text: string): PhoneNumber[] {
  const phones: PhoneNumber[] = [];

  // Phone patterns
  const patterns = [
    // +84 xxx xxx xxxx or 84 xxx xxx xxxx
    /(\+84|84)\s*(\d{2,3})[\s.-]*(\d{3})[\s.-]*(\d{3,4})/g,
    // 0xxx xxx xxxx
    /(0\d{2,3})[\s.-]*(\d{3})[\s.-]*(\d{3,4})/g,
    // Hotline 1800/1900
    /(1[89]00)[\s.-]*(\d{4,6})/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let number = match[0].replace(/[\s.-]/g, '');
      let type: PhoneNumber['type'] = 'unknown';
      let carrier: string | undefined;

      // Normalize to start with 0
      if (number.startsWith('+84')) {
        number = '0' + number.slice(3);
      } else if (number.startsWith('84') && number.length > 9) {
        number = '0' + number.slice(2);
      }

      // Determine type
      if (number.startsWith('1800') || number.startsWith('1900')) {
        type = 'hotline';
      } else if (number.length === 10 && number.startsWith('0')) {
        const prefix = number.slice(0, 3);
        carrier = VIETNAMESE_MOBILE_PREFIXES[prefix];
        type = carrier ? 'mobile' : 'landline';
      } else if (number.length === 11 && number.startsWith('0')) {
        type = 'landline';
      }

      // Format for display
      let formatted = number;
      if (type === 'mobile' && number.length === 10) {
        formatted = `${number.slice(0, 4)} ${number.slice(4, 7)} ${number.slice(7)}`;
      } else if (type === 'hotline') {
        formatted = `${number.slice(0, 4)} ${number.slice(4)}`;
      }

      phones.push({
        number,
        formatted,
        type,
        carrier,
        position: match.index,
      });
    }
  }

  return phones;
}

// ===========================================
// COMBINED ENTITY EXTRACTION
// ===========================================

export interface ExtractedEntities {
  entities: DetectedEntity[];
  banks: Array<{ key: string; info: BankInfo; confidence: number }>;
  ewallets: Array<{ key: string; info: EWalletInfo; confidence: number }>;
  ecommerce: Array<{ key: string; info: ECommerceInfo; confidence: number }>;
  moneyAmounts: MoneyAmount[];
  phoneNumbers: PhoneNumber[];
  senderEntity: {
    type: EntityType | 'unknown';
    key: string | null;
    name: string | null;
    isLegitimate: boolean;
  } | null;
}

/**
 * Extract all entities from email
 */
export function extractAllEntities(
  subject: string,
  body: string,
  senderDomain?: string
): ExtractedEntities {
  const fullText = `${subject} ${body}`;

  return {
    entities: detectEntities(fullText),
    banks: detectBanks(fullText),
    ewallets: detectEWallets(fullText),
    ecommerce: detectECommerce(fullText),
    moneyAmounts: detectMoneyAmounts(fullText),
    phoneNumbers: detectPhoneNumbers(fullText),
    senderEntity: senderDomain ? identifySenderEntity(senderDomain) : null,
  };
}

// ===========================================
// CATEGORY HINTS FOR CLASSIFICATION
// ===========================================

/**
 * Get category hints based on detected entities
 */
export function getCategoryHints(entities: ExtractedEntities): {
  suggestedCategory: string | null;
  confidence: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let suggestedCategory: string | null = null;
  let confidence = 0;

  // Check for transaction indicators
  if (entities.banks.length > 0 || entities.ewallets.length > 0) {
    if (entities.moneyAmounts.length > 0) {
      suggestedCategory = 'transaction';
      confidence = 0.9;
      reasons.push(`Detected bank/e-wallet: ${entities.banks[0]?.info.shortName || entities.ewallets[0]?.info.name}`);
      reasons.push(`Found money amount: ${entities.moneyAmounts[0]?.originalText}`);
    }
  }

  // Check for e-commerce (could be transaction or promotion)
  if (entities.ecommerce.length > 0 && !suggestedCategory) {
    if (entities.moneyAmounts.length > 0) {
      suggestedCategory = 'transaction';
      confidence = 0.8;
      reasons.push(`E-commerce platform: ${entities.ecommerce[0]?.info.name}`);
    } else {
      suggestedCategory = 'promotion';
      confidence = 0.7;
      reasons.push(`E-commerce platform without transaction: ${entities.ecommerce[0]?.info.name}`);
    }
  }

  // Check for social media
  const socialEntities = entities.entities.filter(e => e.type === 'social');
  if (socialEntities.length > 0 && !suggestedCategory) {
    suggestedCategory = 'social';
    confidence = 0.85;
    reasons.push(`Social media notification: ${socialEntities[0]?.name}`);
  }

  // Check for delivery services
  const deliveryEntities = entities.entities.filter(e => e.type === 'delivery');
  if (deliveryEntities.length > 0 && !suggestedCategory) {
    suggestedCategory = 'transaction';
    confidence = 0.75;
    reasons.push(`Delivery service: ${deliveryEntities[0]?.name}`);
  }

  // Check for telecom/utilities
  const telecomEntities = entities.entities.filter(e => e.type === 'telecom');
  if (telecomEntities.length > 0 && entities.moneyAmounts.length > 0 && !suggestedCategory) {
    suggestedCategory = 'transaction';
    confidence = 0.8;
    reasons.push(`Utility bill: ${telecomEntities[0]?.name}`);
  }

  return {
    suggestedCategory,
    confidence,
    reasons,
  };
}

// ===========================================
// EXPORTS
// ===========================================

export default {
  // Data
  VIETNAMESE_BANKS,
  VIETNAMESE_EWALLETS,
  VIETNAMESE_ECOMMERCE,
  VIETNAMESE_DELIVERY,
  VIETNAMESE_TRAVEL,
  VIETNAMESE_TELECOM,
  VIETNAMESE_GOVERNMENT,
  SOCIAL_MEDIA,
  VIETNAMESE_MOBILE_PREFIXES,

  // Detection functions
  detectEntities,
  detectBanks,
  detectEWallets,
  detectECommerce,
  identifySenderEntity,
  detectMoneyAmounts,
  detectPhoneNumbers,
  extractAllEntities,
  getCategoryHints,
};
