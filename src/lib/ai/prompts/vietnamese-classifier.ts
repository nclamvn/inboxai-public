/**
 * Vietnamese Email Classifier Prompts
 * Optimized for GPT-4o-mini with Vietnamese context
 */

// ===========================================
// SYSTEM PROMPT
// ===========================================

export const VIETNAMESE_SYSTEM_PROMPT = `Ban la AI chuyen phan loai email tieng Viet. Ban hieu ro van hoa, ngu canh va cach viet email cua nguoi Viet Nam.

## NHIEM VU
Phan loai email vao 1 trong 7 categories va danh gia do uu tien (1-5).

## CATEGORIES

1. **work** - Email cong viec
   - Tu dong nghiep, sep, doi tac, khach hang
   - Noi dung: bao cao, hop, deadline, du an, task
   - Dau hieu: "Kinh gui", "Dear", dia chi email cong ty, chu ky cong ty

2. **personal** - Email ca nhan
   - Tu ban be, gia dinh, nguoi quen
   - Noi dung: hen gap, hoi tham, chia se, nho va ca nhan
   - Dau hieu: Xung ho than mat ("oi", "nha", "hen"), khong co chu ky formal

3. **transaction** - Giao dich tai chinh
   - Tu ngan hang, vi dien tu, san TMDT
   - Noi dung: bien dong so du, xac nhan thanh toan, hoa don, chuyen khoan
   - Dau hieu: So tien, ma giao dich, "thanh cong", "da nhan"
   - Banks VN: Vietcombank, VietinBank, BIDV, Techcombank, MB Bank, ACB, VPBank, TPBank, Sacombank
   - Vi dien tu: Momo, ZaloPay, VNPay, ShopeePay

4. **newsletter** - Ban tin, cap nhat
   - Tu cac dich vu da dang ky
   - Noi dung: tin tuc, cap nhat san pham, blog, digest
   - Dau hieu: "Unsubscribe", "Huy dang ky", gui dinh ky

5. **promotion** - Khuyen mai, quang cao
   - Tu thuong hieu, cua hang, dich vu
   - Noi dung: giam gia, voucher, flash sale, uu dai
   - Dau hieu: %, "SALE", "Giam", "Mien phi", "Chi con"
   - Brands VN: Shopee, Lazada, Tiki, Sendo, Grab, Be, Gojek

6. **social** - Thong bao mang xa hoi
   - Tu Facebook, Instagram, LinkedIn, Twitter, TikTok, Zalo
   - Noi dung: like, comment, friend request, mention, message
   - Dau hieu: Ten mang xa hoi, "da thich", "da binh luan"

7. **spam** - Thu rac, lua dao
   - Email khong mong muon, lua dao, phishing
   - Dau hieu: Yeu cau thong tin nhay cam, link la, ngu phap sai, qua urgent
   - Canh bao: "Tai khoan bi khoa", "Xac minh ngay", "Trung thuong"

## PRIORITY (1-5)

- **5 - Khan cap**: Can xu ly trong vai gio (deadline hom nay, su co, giao dich lon)
- **4 - Cao**: Can xu ly trong ngay (cong viec quan trong, hop sap toi)
- **3 - Trung binh**: Can xu ly trong tuan (task thuong, follow-up)
- **2 - Thap**: Khong gap (newsletter, thong bao, promotion)
- **1 - Rat thap**: Co the bo qua (spam, quang cao khong quan tam)

## VIET TAT TIENG VIET PHO BIEN

- "e" = em, "a" = anh, "c" = chi
- "k" / "ko" / "hk" = khong
- "dc" / "dc" = duoc
- "r" = roi
- "bn" = ban / bao nhieu
- "vs" = voi
- "trc" = truoc
- "ns" = noi
- "lm" = lam
- "cty" = cong ty
- "pv" = phong van
- "cv" = cong viec
- "gd" = giam doc / gia dinh
- "nv" = nhan vien
- "kh" = khach hang
- "sp" = san pham
- "dt" = dien thoai
- "tk" = tai khoan
- "stk" = so tai khoan
- "ck" = chuyen khoan
- "tks" / "thanks" = cam on
- "ok" / "oke" / "okie" = dong y
- "rep" = reply / tra loi
- "cc" = chi chi (xung ho)
- "nt" = nhan tin
- "ib" = inbox
- "fb" = facebook
- "zl" = zalo
- "sg" = sai gon
- "hn" = ha noi
- "dn" = da nang
- "hp" = hai phong
- "q" = quan (dia chi)
- "p" = phuong (dia chi)
- "tp" = thanh pho
- "t" = tao / toi
- "m" = may / minh
- "ng" = nguoi
- "j" / "z" = gi
- "d" = di / duoc
- "b" = ban / biet
- "v" = vay / ve
- "ntn" = nhu the nao
- "sn" = sinh nhat
- "hb" = happy birthday
- "gk" = gia kinh
- "ct" = cong ty / chu de
- "bp" = bo phan
- "kq" = ket qua
- "tt" = thanh toan / truong thanh / that the
- "gt" = gioi thieu
- "tl" = tra loi / tai lieu
- "hs" = ho so
- "hd" = hop dong / huong dan
- "dn" = doanh nghiep / da nang
- "nc" = noi chuyen / nghien cuu

## NGAN HANG & DICH VU TAI CHINH VIET NAM

**Ngan hang lon:**
Vietcombank (VCB), VietinBank (CTG), BIDV, Agribank, Techcombank (TCB), MB Bank, VPBank, ACB, Sacombank (STB), TPBank, HDBank, OCB, MSB, VIB, Eximbank, SHB, SeABank, LienVietPostBank, NCB, PVcomBank, BaoVietBank, VietABank, NamABank, KienLongBank, VietBank, BacABank, PGBank

**Vi dien tu & Fintech:**
Momo, ZaloPay, VNPay, ShopeePay, Viettel Money, VNPT Pay, Payoo, 9Pay, Foxpay

**Chung khoan:**
VNDirect, SSI, HSC, VCSC, MBS, FPTS, VPS, TCBS, Mirae Asset

## THUONG HIEU VIET NAM PHO BIEN

**E-commerce:**
Shopee, Lazada, Tiki, Sendo, The Gioi Di Dong, Dien May Xanh, FPT Shop, CellphoneS, Bach Hoa Xanh

**Food & Delivery:**
Grab, Be, Gojek, ShopeeFood, Baemin, Loship, Now (Shopee)

**Travel:**
Traveloka, Agoda, Booking.com, Vietnam Airlines, VietJet, Bamboo Airways, Vinpearl

**Telco:**
Viettel, VNPT/Vinaphone, Mobifone, Vietnamobile, Gmobile

**Others:**
VinID, Vingroup, FPT, VNPT, EVN, VNG

## QUY TAC PHAN LOAI

1. **Uu tien sender domain** - Email tu @company.com.vn thuong la work
2. **Xem noi dung chinh** - Bo qua header/footer template
3. **Ngu canh quan trong** - "Anh oi" tu email cong ty van la work
4. **Transaction ro rang** - Co so tien cu the + bank/vi = transaction
5. **Spam signals** - Yeu cau OTP, click link la, qua urgent = spam

## OUTPUT FORMAT

Tra ve JSON voi format:
{
  "category": "work|personal|transaction|newsletter|promotion|social|spam",
  "priority": 1-5,
  "confidence": 0.0-1.0,
  "reasoning": "Giai thich ngan gon bang tieng Viet",
  "detected_entities": ["entity1", "entity2"],
  "is_vietnamese": true/false
}`;

// ===========================================
// FEW-SHOT EXAMPLES
// ===========================================

export interface ClassificationExample {
  sender: string;
  subject: string;
  body: string;
  expected: {
    category: string;
    priority: number;
    confidence: number;
    reasoning: string;
  };
}

export const VIETNAMESE_EXAMPLES: ClassificationExample[] = [
  // ===========================================
  // WORK EXAMPLES (5)
  // ===========================================
  {
    sender: "nguyen.van.a@techcorp.com.vn",
    subject: "Bao cao tien do du an ABC - Tuan 48",
    body: `Kinh gui Anh/Chi,

Em xin gui bao cao tien do du an ABC tuan 48:

1. Hoan thanh: Module thanh toan (100%)
2. Dang thuc hien: Tich hop API (70%)
3. Ke hoach tuan toi: Testing + UAT

Neu co van de gi, anh/chi lien he em nhe.

Tran trong,
Nguyen Van A
Software Developer | TechCorp Vietnam`,
    expected: {
      category: "work",
      priority: 3,
      confidence: 0.95,
      reasoning: "Email bao cao cong viec tu dia chi cong ty, co cau truc formal, noi dung ve du an"
    }
  },
  {
    sender: "hr@fptsoft.com",
    subject: "Thu moi phong van - Vi tri Senior Developer",
    body: `Chao ban Minh,

Cam on ban da quan tam den vi tri Senior Developer tai FPT Software.

Chung toi xin moi ban tham gia buoi phong van:
- Thoi gian: 14:00 ngay 15/12/2024
- Dia diem: Tang 10, FPT Tower, Cau Giay
- Hinh thuc: Phong van truc tiep

Vui long xac nhan tham du qua email nay.

Tran trong,
Phong Nhan su FPT Software`,
    expected: {
      category: "work",
      priority: 4,
      confidence: 0.95,
      reasoning: "Thu moi phong van tu HR cong ty, co deadline cu the, can phan hoi som"
    }
  },
  {
    sender: "giamdoc@abccompany.vn",
    subject: "GAP: Hop khan chieu nay 3PM",
    body: `Team,

Hop khan cap chieu nay luc 3PM tai phong hop A.
Noi dung: Review incident he thong sang nay.

Tat ca member bat buoc tham gia.

Thanks,
GD`,
    expected: {
      category: "work",
      priority: 5,
      confidence: 0.98,
      reasoning: "Email khan cap tu Giam doc, hop bat buoc trong ngay, co incident"
    }
  },
  {
    sender: "client@bigcorp.com",
    subject: "Re: Quotation for Q1 2025 project",
    body: `Hi team,

Thanks for the quotation. We'd like to proceed with Option B.

Can you send the contract by Friday?

Best regards,
John`,
    expected: {
      category: "work",
      priority: 4,
      confidence: 0.92,
      reasoning: "Email tu khach hang ve bao gia, can gui hop dong, co deadline"
    }
  },
  {
    sender: "it-support@company.vn",
    subject: "Thong bao bao tri he thong",
    body: `Kinh gui toan the CBNV,

Phong IT xin thong bao lich bao tri he thong:
- Thoi gian: 22:00 - 02:00, Thu 7 ngay 16/12
- Anh huong: Email, VPN, ERP

Moi thac mac xin lien he IT Support.

Tran trong,
Phong IT`,
    expected: {
      category: "work",
      priority: 3,
      confidence: 0.90,
      reasoning: "Thong bao IT noi bo cong ty ve bao tri, anh huong cong viec cuoi tuan"
    }
  },

  // ===========================================
  // PERSONAL EXAMPLES (5)
  // ===========================================
  {
    sender: "thuyhang1990@gmail.com",
    subject: "Oi mai di cafe ko?",
    body: `Hiii ban oi!

Lau qua k gap r, mai ranh k? Di cafe catch up di.
Minh book cho quen hen, 3PM ok k?

Miss u nhieu <3`,
    expected: {
      category: "personal",
      priority: 2,
      confidence: 0.95,
      reasoning: "Email tu ban be ca nhan, ngon ngu than mat, hen gap cafe"
    }
  },
  {
    sender: "me.vu@gmail.com",
    subject: "Con oi goi dien cho me",
    body: `Con yeu,

May hom nay me goi ma con k nghe may. Co viec gi k con?
Cuoi tuan ve nha an com voi ba me nha.

Me nho con!`,
    expected: {
      category: "personal",
      priority: 3,
      confidence: 0.98,
      reasoning: "Email tu me, noi dung gia dinh, xung ho than mat"
    }
  },
  {
    sender: "hoanganh.friend@yahoo.com",
    subject: "Chuc mung sinh nhat ban iu!",
    body: `Happy Birthday ban oiiii!

Chuc ban tuoi moi:
- That nhieu suc khoe
- Cong viec hanh thong
- Som co ny hihi

Toi party nhe!`,
    expected: {
      category: "personal",
      priority: 2,
      confidence: 0.95,
      reasoning: "Chuc mung sinh nhat tu ban be, ngon ngu vui ve than mat"
    }
  },
  {
    sender: "anhhai.nguyen@gmail.com",
    subject: "Nho ti viec",
    body: `E,

Tuan sau a co dam cuoi o SG, e co ranh dua a ra san bay k?
Bay luc 7AM thu 6. A se den com :))

Thanks em nhe!
Anh Hai`,
    expected: {
      category: "personal",
      priority: 3,
      confidence: 0.90,
      reasoning: "Nho va ca nhan tu nguoi quen, xung ho anh/em than mat"
    }
  },
  {
    sender: "lop12a1.reunion@gmail.com",
    subject: "Hop lop 20 nam - Can confirm",
    body: `Cac ban 12A1 than men!

Hop lop ky niem 20 nam ra truong:
- Ngay: 25/12/2024
- Dia diem: Nha hang Sen Hong, Q1
- Chi phi: 500k/nguoi

Ai di confirm trong group Zalo nhe!

BCS lop`,
    expected: {
      category: "personal",
      priority: 2,
      confidence: 0.88,
      reasoning: "Thong bao hop lop, mang tinh ca nhan, khong phai cong viec"
    }
  },

  // ===========================================
  // TRANSACTION EXAMPLES (5)
  // ===========================================
  {
    sender: "no-reply@vietcombank.com.vn",
    subject: "Thong bao bien dong so du",
    body: `VCB: TK 0071000123456 -2,500,000VND luc 14:30 15/12. SD: 45,230,000VND. GD: CK MOMO. Chi tiet lien he 1900545413`,
    expected: {
      category: "transaction",
      priority: 3,
      confidence: 0.99,
      reasoning: "Thong bao bien dong so du tu Vietcombank, co so tien va so du cu the"
    }
  },
  {
    sender: "support@momo.vn",
    subject: "Xac nhan giao dich thanh cong",
    body: `MOMO - GIAO DICH THANH CONG

Ban da chuyen tien thanh cong!

So tien: 150,000d
Nguoi nhan: NGUYEN VAN B
Ma GD: MP241215143025
Thoi gian: 15/12/2024 14:30

So du vi: 2,350,000d`,
    expected: {
      category: "transaction",
      priority: 3,
      confidence: 0.98,
      reasoning: "Xac nhan giao dich tu Momo, co day du thong tin so tien, ma GD"
    }
  },
  {
    sender: "thongbao@techcombank.com.vn",
    subject: "Sao ke tai khoan thang 11/2024",
    body: `Kinh gui Quy khach,

Techcombank xin gui sao ke tai khoan thang 11/2024.

So tai khoan: 19036xxxxx456
So du dau ky: 12,500,000 VND
So du cuoi ky: 28,750,000 VND

Chi tiet vui long xem file dinh kem.

Tran trong,
Techcombank`,
    expected: {
      category: "transaction",
      priority: 2,
      confidence: 0.95,
      reasoning: "Sao ke ngan hang dinh ky tu Techcombank, thong tin tai khoan"
    }
  },
  {
    sender: "order@shopee.vn",
    subject: "Don hang #241215789 da duoc thanh toan",
    body: `Don hang cua ban da duoc thanh toan thanh cong!

Ma don: #241215789
San pham: Tai nghe Bluetooth Sony
So tien: 1,250,000d
PTTT: ShopeePay

Du kien giao: 17-19/12/2024

Theo doi don hang tai app Shopee.`,
    expected: {
      category: "transaction",
      priority: 2,
      confidence: 0.93,
      reasoning: "Xac nhan thanh toan don hang Shopee, co ma don va so tien"
    }
  },
  {
    sender: "billing@grab.com",
    subject: "Hoa don chuyen xe GrabCar",
    body: `Cam on ban da di cung Grab!

Chi tiet chuyen xe:
- Diem don: 123 Nguyen Hue, Q1
- Diem den: San bay Tan Son Nhat
- Quang duong: 8.5km
- Tong tien: 125,000d

Thanh toan: GrabPay

Danh gia tai xe trong app nhe!`,
    expected: {
      category: "transaction",
      priority: 1,
      confidence: 0.92,
      reasoning: "Hoa don chuyen xe Grab, giao dich da hoan thanh, thong tin chi tiet"
    }
  },

  // ===========================================
  // NEWSLETTER EXAMPLES (3)
  // ===========================================
  {
    sender: "newsletter@viblo.asia",
    subject: "Viblo Weekly #48 - Top bai viet tuan nay",
    body: `Chao ban,

Day la nhung bai viet hot nhat tuan nay tren Viblo:

1. Toi uu performance React voi useMemo
2. Kubernetes cho nguoi moi bat dau
3. Clean Architecture trong du an thuc te

Doc them tai viblo.asia

---
Huy dang ky: https://viblo.asia/unsubscribe`,
    expected: {
      category: "newsletter",
      priority: 2,
      confidence: 0.95,
      reasoning: "Ban tin hang tuan tu Viblo, tong hop bai viet, co link unsubscribe"
    }
  },
  {
    sender: "digest@medium.com",
    subject: "Daily Digest: Stories for you",
    body: `Hi there,

Here's what's trending on Medium today:

- The Future of AI in 2025
- Why Remote Work is Here to Stay
- Building a Second Brain

Read more on Medium

Unsubscribe from this email`,
    expected: {
      category: "newsletter",
      priority: 1,
      confidence: 0.93,
      reasoning: "Daily digest tu Medium, tong hop bai viet, newsletter dinh ky"
    }
  },
  {
    sender: "updates@notion.so",
    subject: "What's new in Notion - December 2024",
    body: `Hey there

Here's what's new in Notion this month:

New features:
- AI improvements
- Better calendar view
- Mobile app updates

Learn more about these updates

Unsubscribe | Manage preferences`,
    expected: {
      category: "newsletter",
      priority: 2,
      confidence: 0.94,
      reasoning: "Cap nhat san pham tu Notion, newsletter dinh ky, co unsubscribe"
    }
  },

  // ===========================================
  // PROMOTION EXAMPLES (3)
  // ===========================================
  {
    sender: "marketing@shopee.vn",
    subject: "FLASH SALE 12.12 - Giam den 50%!",
    body: `SIEU SALE 12.12 - CHI HOM NAY!

Uu dai cuc shock:
- Dien thoai giam 50%
- Thoi trang giam 70%
- Freeship don tu 0d

Chi con 6 tieng!

Mua ngay: shopee.vn/1212

Huy dang ky: shopee.vn/unsubscribe`,
    expected: {
      category: "promotion",
      priority: 2,
      confidence: 0.98,
      reasoning: "Email marketing sale tu Shopee, nhieu % giam gia, urgency message"
    }
  },
  {
    sender: "voucher@grab.com",
    subject: "Tang ban voucher 50K cho chuyen di tiep theo",
    body: `Hi ban!

Lau qua khong thay ban di Grab

Day la voucher 50,000d cho ban:
Ma: COMEBACK50
HSD: 20/12/2024

Ap dung cho GrabCar & GrabBike

Book ngay trong app Grab!`,
    expected: {
      category: "promotion",
      priority: 2,
      confidence: 0.95,
      reasoning: "Voucher khuyen mai tu Grab, ma giam gia, re-engagement campaign"
    }
  },
  {
    sender: "deals@tiki.vn",
    subject: "Ma giam 100K cho don hang Dien tu",
    body: `DEAL HOT CUOI NAM!

Nhap ma: TECH100
Giam 100,000d cho don tu 500,000d

Ap dung:
- Dien thoai, Laptop
- Phu kien cong nghe
- Do gia dung thong minh

HSD: 31/12/2024

Mua ngay tai tiki.vn`,
    expected: {
      category: "promotion",
      priority: 2,
      confidence: 0.96,
      reasoning: "Ma giam gia tu Tiki, co dieu kien ap dung, promotion email"
    }
  },

  // ===========================================
  // SOCIAL EXAMPLES (2)
  // ===========================================
  {
    sender: "notification@facebook.com",
    subject: "Minh Nguyen da binh luan ve bai viet cua ban",
    body: `Minh Nguyen da binh luan ve bai viet cua ban:

"Bai viet hay qua! Cho minh hoi them ve phan..."

Xem binh luan: fb.com/...

---
Quan ly thong bao: facebook.com/settings`,
    expected: {
      category: "social",
      priority: 2,
      confidence: 0.97,
      reasoning: "Thong bao comment tu Facebook, social notification"
    }
  },
  {
    sender: "no-reply@linkedin.com",
    subject: "You have 3 new connection requests",
    body: `Hi there,

You have new activity on LinkedIn:

- 3 connection requests
- 5 profile views this week
- 2 job recommendations

See your network updates

Unsubscribe from emails`,
    expected: {
      category: "social",
      priority: 2,
      confidence: 0.95,
      reasoning: "Thong bao hoat dong tu LinkedIn, connection requests"
    }
  },

  // ===========================================
  // SPAM EXAMPLES (2)
  // ===========================================
  {
    sender: "security-alert@vietcombank.verify-now.xyz",
    subject: "KHAN CAP: Tai khoan cua ban se bi khoa!",
    body: `CANH BAO KHAN CAP!

Tai khoan Vietcombank cua ban se bi KHOA trong 24h!

Chung toi phat hien hoat dong dang nghi. Vui long xac minh NGAY:

Click vao day de xac minh: http://vietcombank.verify-now.xyz/login

Neu khong xac minh, tai khoan se bi dinh chi vinh vien!

Vietcombank Security Team`,
    expected: {
      category: "spam",
      priority: 1,
      confidence: 0.99,
      reasoning: "Phishing gia mao Vietcombank, domain gia (.xyz), yeu cau urgent, link la"
    }
  },
  {
    sender: "winner@lottery-vn.com",
    subject: "CHUC MUNG! Ban trung 500 TRIEU dong!",
    body: `XIN CHUC MUNG!

Ban da duoc chon ngau nhien trung giai thuong:

500,000,000 VND

De nhan thuong, vui long:
1. Gui CMND/CCCD
2. So tai khoan ngan hang
3. Phi xu ly 2,000,000d

Lien he ngay: 0909.xxx.xxx

Chi con 48 gio de nhan thuong!`,
    expected: {
      category: "spam",
      priority: 1,
      confidence: 0.99,
      reasoning: "Lua dao trung thuong, yeu cau thong tin ca nhan va tien, urgency gia"
    }
  }
];

// ===========================================
// PROMPT BUILDER
// ===========================================

export function buildClassificationPrompt(
  subject: string,
  body: string,
  senderEmail: string,
  senderName?: string
): string {
  // Truncate body if too long
  const maxBodyLength = 2000;
  const truncatedBody = body.length > maxBodyLength
    ? body.substring(0, maxBodyLength) + "...[truncated]"
    : body;

  return `Phan loai email sau:

**Sender:** ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}
**Subject:** ${subject}
**Body:**
${truncatedBody}

Tra ve JSON voi format da dinh nghia.`;
}

// ===========================================
// FEW-SHOT PROMPT BUILDER
// ===========================================

export function buildFewShotPrompt(
  subject: string,
  body: string,
  senderEmail: string,
  senderName?: string,
  numExamples: number = 3
): string {
  // Select diverse examples (1 from each common category)
  const selectedExamples = selectDiverseExamples(numExamples);

  let prompt = "Duoi day la mot so vi du phan loai:\n\n";

  selectedExamples.forEach((example, index) => {
    prompt += `--- Vi du ${index + 1} ---
Sender: ${example.sender}
Subject: ${example.subject}
Body: ${example.body.substring(0, 300)}...

Ket qua: ${JSON.stringify(example.expected, null, 2)}

`;
  });

  prompt += `--- Email can phan loai ---
${buildClassificationPrompt(subject, body, senderEmail, senderName)}`;

  return prompt;
}

function selectDiverseExamples(num: number): ClassificationExample[] {
  const categories = ['work', 'personal', 'transaction', 'promotion', 'spam'];
  const selected: ClassificationExample[] = [];

  for (let i = 0; i < Math.min(num, categories.length); i++) {
    const category = categories[i];
    const example = VIETNAMESE_EXAMPLES.find(e => e.expected.category === category);
    if (example) {
      selected.push(example);
    }
  }

  return selected;
}

// ===========================================
// GET EXAMPLES BY CATEGORY
// ===========================================

export function getExamplesByCategory(category: string): ClassificationExample[] {
  return VIETNAMESE_EXAMPLES.filter(e => e.expected.category === category);
}

export function getRandomExamples(count: number): ClassificationExample[] {
  const shuffled = [...VIETNAMESE_EXAMPLES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ===========================================
// CATEGORY KEYWORDS (for quick matching)
// ===========================================

export const CATEGORY_KEYWORDS = {
  work: [
    'kinh gui', 'tran trong', 'bao cao', 'deadline', 'du an', 'hop', 'meeting',
    'phong van', 'cong ty', 'cty', 'nhan vien', 'nv', 'giam doc', 'gd',
    'khach hang', 'kh', 'doi tac', 'quote', 'quotation', 'proposal',
    'task', 'project', 'sprint', 'review', 'deploy', 'release'
  ],
  personal: [
    'oi', 'nha', 'nhe', 'hen', 'miss', 'yeu', 'thuong', 'nho',
    'sinh nhat', 'sn', 'happy birthday', 'hb', 'party',
    'gia dinh', 'ba me', 'anh chi', 'ban be', 'hop lop'
  ],
  transaction: [
    'bien dong', 'so du', 'chuyen khoan', 'ck', 'thanh toan', 'tt',
    'ma giao dich', 'ma gd', 'hoa don', 'invoice', 'tai khoan', 'tk',
    'vnd', 'dong', 'd', 'ngan hang', 'bank', 'vi dien tu'
  ],
  newsletter: [
    'weekly', 'digest', 'newsletter', 'ban tin', 'cap nhat',
    'unsubscribe', 'huy dang ky', 'subscribe'
  ],
  promotion: [
    'sale', 'giam gia', 'giam', 'khuyen mai', 'uu dai', 'voucher',
    'ma giam', 'flash sale', 'deal', 'hot deal', 'mien phi', 'free',
    '%', 'off', 'freeship'
  ],
  social: [
    'facebook', 'fb', 'instagram', 'ig', 'linkedin', 'twitter',
    'tiktok', 'zalo', 'zl', 'like', 'comment', 'binh luan',
    'friend request', 'ket ban', 'mention', 'tag'
  ],
  spam: [
    'trung thuong', 'khoa tai khoan', 'xac minh ngay', 'khan cap',
    'click ngay', 'verify', 'suspended', 'urgent', 'winner',
    'lottery', 'prize', 'free money'
  ]
};

// ===========================================
// EXPORTS
// ===========================================

export default {
  systemPrompt: VIETNAMESE_SYSTEM_PROMPT,
  examples: VIETNAMESE_EXAMPLES,
  categoryKeywords: CATEGORY_KEYWORDS,
  buildClassificationPrompt,
  buildFewShotPrompt,
  getExamplesByCategory,
  getRandomExamples,
};
