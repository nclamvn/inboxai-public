// Vietnamese trusted domains database for email classification
// Categories: banks, fintech, ecommerce, transport, government, education, enterprises, newsletters

export const VIETNAMESE_DOMAINS = {
  // NGÂN HÀNG - Luôn là TRANSACTION, KHÔNG BAO GIỜ SPAM
  banks: [
    // Vietnamese banks
    'bidv.com.vn', 'vietcombank.com.vn', 'techcombank.com.vn',
    'vietinbank.vn', 'mbbank.com.vn', 'tpbank.vn', 'vpbank.com.vn',
    'acb.com.vn', 'sacombank.com.vn', 'hdbank.com.vn', 'ocb.com.vn',
    'msb.com.vn', 'vib.com.vn', 'seabank.com.vn', 'lpbank.com.vn',
    'abbank.vn', 'namabank.com.vn', 'kienlongbank.com.vn',
    'baovietbank.com.vn', 'shb.com.vn', 'pvcombank.com.vn',
    'eximbank.com.vn', 'scb.com.vn', 'ncb-bank.vn', 'pgbank.com.vn',
    'vietbank.com.vn', 'baoviethbank.com.vn', 'lienvietpostbank.com.vn',
    'saigonbank.com.vn', 'vrbank.com.vn', 'bvbank.com.vn',
    // International banks in VN
    'hsbc.com.vn', 'standardchartered.com.vn', 'citibank.com.vn',
    'uob.com.vn', 'shinhan.com.vn', 'wooribank.com.vn', 'anz.com',
    'publicbank.com.vn', 'maybank.com.vn', 'cimb.com.vn',
    // Card brands
    'visa.com', 'mastercard.com', 'jcb.com',
  ],

  // VÍ ĐIỆN TỬ / FINTECH - TRANSACTION
  fintech: [
    'momo.vn', 'zalopay.vn', 'viettelpay.vn', 'vnpay.vn',
    'moca.vn', 'airpay.vn', 'shopeepay.vn', 'grab.com',
    'payoo.vn', 'nganluong.vn', 'baokim.vn', 'paypal.com',
    'stripe.com', 'mservice.com.vn', 'napas.com.vn',
    'smartpay.vn', 'foxpay.vn', 'gpay.vn', 'appotapay.com',
    'onepay.vn', '123pay.vn', 'senpay.vn',
  ],

  // ECOMMERCE - TRANSACTION (đơn hàng) hoặc PROMOTION (marketing)
  ecommerce: [
    'shopee.vn', 'lazada.vn', 'tiki.vn', 'sendo.vn',
    'thegioididong.com', 'dienmayxanh.com', 'cellphones.com.vn',
    'fptshop.com.vn', 'nguyenkim.com', 'mediamart.vn',
    'bachhoaxanh.com', 'vinmart.com', 'lotte.vn',
    'amazon.com', 'ebay.com', 'alibaba.com', 'aliexpress.com',
    'tgdd.vn', 'dmx.vn', 'cps.com.vn', 'phongvu.vn',
    'gearvn.com', 'anphatpc.com.vn', 'hacom.vn',
    'hc.com.vn', 'pico.vn', 'concung.com', 'guardian.com.vn',
    'pharmacity.vn', 'medicare.vn', 'fahasa.com',
    'yes24.vn', 'vinabook.com',
  ],

  // DỊCH VỤ VẬN TẢI - TRANSACTION
  transport: [
    // Ride-hailing
    'grab.com', 'be.com.vn', 'gojek.com', 'xanh-sm.com',
    'mai-linh.vn', 'vinasun.com.vn',
    // Airlines
    'vietjetair.com', 'vietnamairlines.com', 'bambooairways.com',
    'pacificairlines.com', 'jetstar.com', 'vietravelairlines.vn',
    // Bus/Train
    'vexere.com', 'futabus.vn', 'thesinhtourist.vn',
    'dsvn.vn', 'baolau.com',
    // Shipping
    'ghn.vn', 'giaohangnhanh.vn', 'ghtk.vn', 'giaohangtietkiem.vn',
    'vnpost.vn', 'viettelpost.com.vn', 'jtexpress.vn',
    'ninjavan.co', 'spx.vn', 'best-inc.vn', 'ahamove.com',
    'lalamove.com',
  ],

  // BOOKING/TRAVEL - TRANSACTION
  travel: [
    'booking.com', 'agoda.com', 'traveloka.com', 'airbnb.com',
    'hotels.com', 'expedia.com', 'trivago.com', 'trip.com',
    'vntrip.vn', 'mytour.vn', 'ivivu.com', 'chudu24.com',
    'bookingcare.vn', 'klook.com', 'viator.com',
  ],

  // CHÍNH PHỦ / CÔNG - WORK
  government: [
    'gov.vn', 'chinhphu.vn', 'mof.gov.vn', 'most.gov.vn',
    'customs.gov.vn', 'gdt.gov.vn', 'bhxh.gov.vn',
    'moit.gov.vn', 'moj.gov.vn', 'mic.gov.vn',
    'dangcongsan.vn', 'thuedientu.gdt.gov.vn',
    'hcmtax.gov.vn', 'hanoi.gov.vn', 'hochiminhcity.gov.vn',
    'danang.gov.vn', 'haiphong.gov.vn',
  ],

  // GIÁO DỤC - WORK
  education: [
    // Generic
    'edu.vn',
    // Top universities
    'vnu.edu.vn', 'hust.edu.vn', 'neu.edu.vn', 'ueh.edu.vn',
    'uet.vnu.edu.vn', 'ussh.edu.vn', 'hcmus.edu.vn',
    'uit.edu.vn', 'hcmut.edu.vn', 'ptit.edu.vn',
    'ftu.edu.vn', 'ntu.edu.vn', 'dlu.edu.vn',
    // Private
    'fpt.edu.vn', 'vinuni.edu.vn', 'rmit.edu.vn',
    'buh.edu.vn', 'sis.edu.vn', 'vinschool.edu.vn',
    'agu.edu.vn', 'tdtu.edu.vn', 'hutech.edu.vn',
    // Online education
    'udemy.com', 'coursera.org', 'edx.org', 'skillshare.com',
    'linkedin.com', 'duolingo.com',
  ],

  // CÔNG TY LỚN VN - WORK
  enterprises: [
    'vingroup.net', 'fpt.com.vn', 'viettel.com.vn',
    'vnpt.vn', 'mobifone.vn', 'evn.com.vn',
    'petrolimex.com.vn', 'pvoil.com.vn', 'pvn.vn',
    'agribank.com.vn', 'vinaphone.com.vn',
    'thaco.com.vn', 'masangroup.com', 'novagroup.vn',
    'sungroup.com.vn', 'saigontourist.net', 'hoa-phat.com.vn',
    'hpe.com.vn', 'samsung.com', 'lg.com', 'intel.com',
  ],

  // TECH PLATFORMS - Check subject for category
  techPlatforms: [
    'google.com', 'apple.com', 'microsoft.com', 'github.com',
    'gitlab.com', 'bitbucket.org', 'atlassian.com', 'jira.com',
    'slack.com', 'notion.so', 'figma.com', 'canva.com',
    'dropbox.com', 'zoom.us', 'meet.google.com',
    'vercel.com', 'netlify.com', 'heroku.com', 'aws.amazon.com',
    'digitalocean.com', 'cloudflare.com',
  ],

  // NEWSLETTER ĐÁNG TIN - NEWSLETTER (không phải spam)
  trustedNewsletters: [
    'substack.com', 'medium.com', 'linkedin.com',
    'mailchimp.com', 'sendgrid.net', 'hubspot.com',
    'statista.com', 'morningbrew.com', 'theweek.com',
    'hackernewsletter.com', 'dailydev.to', 'tldr.tech',
    'javascriptweekly.com', 'reactnewsletter.com',
    'nodeweekly.com', 'pythonweekly.com',
    'vnexpress.net', 'tuoitre.vn', 'thanhnien.vn',
    'dantri.com.vn', 'kenh14.vn', 'cafebiz.vn',
    'techz.vn', 'genk.vn', 'tinhte.vn',
  ],

  // SOCIAL MEDIA - SOCIAL category
  social: [
    'facebook.com', 'fb.com', 'instagram.com', 'twitter.com',
    'x.com', 'tiktok.com', 'youtube.com', 'linkedin.com',
    'pinterest.com', 'reddit.com', 'discord.com', 'telegram.org',
    'zalo.me', 'zalo.vn',
  ],

  // FOOD DELIVERY - TRANSACTION
  food: [
    'now.vn', 'shopeefood.vn', 'baemin.vn', 'grabfood.vn',
    'loship.vn', 'gofood.vn',
  ],
}

// Common spam domain patterns
export const SPAM_DOMAIN_PATTERNS = [
  /^mail\d+\./, // mail123.domain.com
  /^promo\./, // promo.domain.com
  /^offers?\./, // offer.domain.com
  /^deals?\./, // deal.domain.com
  /\.xyz$/, // .xyz TLD often spam
  /\.top$/, // .top TLD often spam
  /\.click$/, // .click TLD often spam
  /\.loan$/, // .loan TLD often spam
  /\.work$/, // .work TLD spam-prone
  /\.online$/, // .online TLD spam-prone
]

// Email address patterns for classification hints
export const EMAIL_ADDRESS_PATTERNS = {
  // Transaction patterns - high confidence
  transaction: [
    /otp@/i, /verify@/i, /security@/i, /alert@/i, /alerts@/i,
    /notification@/i, /notify@/i, /noti@/i,
    /order@/i, /orders@/i, /booking@/i, /bookings@/i,
    /invoice@/i, /invoices@/i, /receipt@/i, /receipts@/i,
    /payment@/i, /payments@/i, /billing@/i,
    /confirm@/i, /confirmation@/i,
    /delivery@/i, /shipping@/i, /tracking@/i,
  ],

  // Work patterns
  work: [
    /hr@/i, /admin@/i, /it@/i, /finance@/i, /accounting@/i,
    /support@/i, /helpdesk@/i, /contact@/i,
    /team@/i, /info@/i, /hello@/i,
  ],

  // Newsletter patterns
  newsletter: [
    /newsletter@/i, /news@/i, /digest@/i,
    /weekly@/i, /daily@/i, /monthly@/i,
    /updates@/i, /blog@/i, /content@/i,
  ],

  // Promotion/Marketing patterns
  promotion: [
    /promo@/i, /promotion@/i, /promotions@/i,
    /marketing@/i, /deals@/i, /offers@/i,
    /sales@/i, /sale@/i, /discount@/i,
    /campaign@/i, /campaigns@/i, /ads@/i,
  ],

  // System/No-reply patterns - needs content analysis
  system: [
    /noreply@/i, /no-reply@/i, /donotreply@/i, /do-not-reply@/i,
    /mailer@/i, /mailer-daemon@/i,
    /bounce@/i, /bounces@/i, /return@/i,
    /auto@/i, /automated@/i, /automail@/i,
  ],
}

/**
 * Check if domain belongs to a known category
 */
export function getDomainCategory(domain: string): {
  category: string | null
  subCategory: string | null
  trustLevel: 'high' | 'medium' | 'low' | null
} {
  const domainLower = domain.toLowerCase()

  // Check banks - highest trust
  if (VIETNAMESE_DOMAINS.banks.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'transaction', subCategory: 'bank', trustLevel: 'high' }
  }

  // Check fintech
  if (VIETNAMESE_DOMAINS.fintech.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'transaction', subCategory: 'fintech', trustLevel: 'high' }
  }

  // Check government
  if (VIETNAMESE_DOMAINS.government.some(d => domainLower.endsWith(d))) {
    return { category: 'work', subCategory: 'government', trustLevel: 'high' }
  }

  // Check education
  if (VIETNAMESE_DOMAINS.education.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'work', subCategory: 'education', trustLevel: 'high' }
  }

  // Check enterprises
  if (VIETNAMESE_DOMAINS.enterprises.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'work', subCategory: 'enterprise', trustLevel: 'medium' }
  }

  // Check ecommerce
  if (VIETNAMESE_DOMAINS.ecommerce.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'ecommerce', subCategory: 'shop', trustLevel: 'medium' }
  }

  // Check transport
  if (VIETNAMESE_DOMAINS.transport.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'transaction', subCategory: 'transport', trustLevel: 'medium' }
  }

  // Check travel
  if (VIETNAMESE_DOMAINS.travel.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'transaction', subCategory: 'travel', trustLevel: 'medium' }
  }

  // Check food delivery
  if (VIETNAMESE_DOMAINS.food.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'transaction', subCategory: 'food', trustLevel: 'medium' }
  }

  // Check social media
  if (VIETNAMESE_DOMAINS.social.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'social', subCategory: 'social', trustLevel: 'medium' }
  }

  // Check trusted newsletters
  if (VIETNAMESE_DOMAINS.trustedNewsletters.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'newsletter', subCategory: 'trusted', trustLevel: 'medium' }
  }

  // Check tech platforms
  if (VIETNAMESE_DOMAINS.techPlatforms.some(d => domainLower.includes(d.replace(/\./g, '')))) {
    return { category: 'tech', subCategory: 'platform', trustLevel: 'medium' }
  }

  // Check spam patterns
  if (SPAM_DOMAIN_PATTERNS.some(pattern => pattern.test(domainLower))) {
    return { category: 'spam', subCategory: 'suspicious_domain', trustLevel: 'low' }
  }

  return { category: null, subCategory: null, trustLevel: null }
}

/**
 * Get email address pattern hints
 */
export function getEmailPatternHint(emailAddress: string): {
  hint: string | null
  confidence: number
} {
  const emailLower = emailAddress.toLowerCase()

  for (const [category, patterns] of Object.entries(EMAIL_ADDRESS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(emailLower)) {
        return { hint: category, confidence: 0.6 }
      }
    }
  }

  return { hint: null, confidence: 0 }
}
