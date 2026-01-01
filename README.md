# InboxAI - Hộp Thư Thông Minh

Hệ thống quản lý email thông minh sử dụng AI, được thiết kế cho người dùng Việt Nam.

## Tính Năng Chính

- **Phân loại email tự động** - AI tự động phân loại email thành: công việc, cá nhân, giao dịch, newsletter, khuyến mãi, mạng xã hội, spam
- **Tóm tắt thông minh** - Tóm tắt nội dung email dài chỉ trong vài câu
- **Smart Reply** - Gợi ý câu trả lời phù hợp với ngữ cảnh
- **Trích xuất hành động** - Tự động phát hiện tasks, deadlines, câu hỏi cần trả lời
- **Follow-up Detection** - Phát hiện email cần theo dõi
- **Báo cáo tuần** - Thống kê và insights về email hàng tuần
- **Đa tài khoản** - Kết nối nhiều tài khoản email (Gmail, Outlook, Yahoo, IMAP tùy chỉnh)
- **Giao diện đẹp** - Dark/Light mode, responsive trên mọi thiết bị

## Công Nghệ Sử Dụng

| Thành phần | Công nghệ |
|------------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, Supabase |
| Database | PostgreSQL (Supabase) |
| AI | OpenAI GPT-4o-mini, Anthropic Claude (dự phòng) |
| Email | IMAP/SMTP (imapflow, nodemailer), Gmail API |
| Auth | Supabase Auth, Google OAuth |
| Email Service | Resend |

## Yêu Cầu Hệ Thống

- Node.js 18.x trở lên
- npm hoặc yarn
- Tài khoản Supabase (miễn phí)
- API key OpenAI hoặc Anthropic
- Tài khoản Resend (miễn phí)
- (Tùy chọn) Google Cloud Console project cho Gmail OAuth

## Hướng Dẫn Cài Đặt

### Bước 1: Clone Repository

```bash
git clone https://github.com/your-username/ai-mailbox.git
cd ai-mailbox
```

### Bước 2: Cài Đặt Dependencies

```bash
npm install
```

### Bước 3: Thiết Lập Supabase

1. Tạo project mới tại [supabase.com](https://supabase.com)

2. Vào **Project Settings** > **API** để lấy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

3. Chạy migrations để tạo database schema:
   ```bash
   # Cài Supabase CLI nếu chưa có
   npm install -g supabase

   # Login
   supabase login

   # Link project
   supabase link --project-ref YOUR_PROJECT_REF

   # Push migrations
   supabase db push
   ```

### Bước 4: Thiết Lập OpenAI API

1. Đăng ký tại [platform.openai.com](https://platform.openai.com)
2. Tạo API key tại **API Keys**
3. Sao chép key → `OPENAI_API_KEY`

### Bước 5: Thiết Lập Resend (Gửi Email)

1. Đăng ký tại [resend.com](https://resend.com)
2. Tạo API key → `RESEND_API_KEY`
3. Thêm và verify domain của bạn
4. Tạo Webhook tại **Webhooks**:
   - URL: `https://your-domain.com/api/webhooks/resend`
   - Events: Chọn tất cả
   - Sao chép signing secret → `RESEND_WEBHOOK_SECRET`

### Bước 6: (Tùy chọn) Thiết Lập Google OAuth

Nếu muốn hỗ trợ đăng nhập bằng Google và kết nối Gmail:

1. Truy cập [Google Cloud Console](https://console.cloud.google.com)

2. Tạo project mới hoặc chọn project có sẵn

3. Vào **APIs & Services** > **OAuth consent screen**:
   - Chọn "External"
   - Điền thông tin app
   - Thêm scopes:
     - `openid`
     - `email`
     - `profile`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`

4. Vào **APIs & Services** > **Credentials**:
   - Tạo **OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/google/callback` (development)
     - `https://your-domain.com/api/auth/google/callback` (production)
   - Sao chép Client ID → `GOOGLE_CLIENT_ID`
   - Sao chép Client Secret → `GOOGLE_CLIENT_SECRET`

5. Bật Gmail API:
   - Vào **APIs & Services** > **Library**
   - Tìm "Gmail API" và bật

### Bước 7: Cấu Hình Environment Variables

Tạo file `.env.local` từ template:

```bash
cp .env.example .env.local
```

Điền các giá trị:

```env
# Supabase (Bắt buộc)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# AI - Chọn ít nhất 1 (OpenAI khuyến nghị)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...  # Tùy chọn, dự phòng

# Resend - Gửi email (Bắt buộc)
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
RESEND_FROM_EMAIL=noreply@your-domain.com

# Google OAuth (Tùy chọn - cho Gmail)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Mã hóa mật khẩu email IMAP (Bắt buộc)
# Tạo bằng: openssl rand -hex 32
ENCRYPTION_KEY=your-32-byte-hex-key

# CRON Secret - Bảo vệ cron endpoints (Bắt buộc cho production)
# Tạo bằng: openssl rand -hex 32
CRON_SECRET=your-random-secret

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Domain cho mailbox (nếu có custom domain với Resend)
NEXT_PUBLIC_MAILBOX_DOMAIN=your-domain.com

# Maintenance Mode (tùy chọn)
MAINTENANCE_MODE=false

# Sentry (tùy chọn - error tracking)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

### Bước 8: Chạy Development Server

```bash
npm run dev
```

Truy cập [http://localhost:3000](http://localhost:3000)

## Database Schema

Project sử dụng các bảng chính sau:

| Bảng | Mô tả |
|------|-------|
| `profiles` | Thông tin người dùng |
| `emails` | Email đã sync |
| `source_accounts` | Tài khoản email đã kết nối |
| `action_items` | Tasks trích xuất từ email |
| `follow_ups` | Email cần theo dõi |
| `automation_rules` | Quy tắc tự động hóa |
| `email_feedback` | Phản hồi người dùng về AI |
| `sender_reputation` | Độ tin cậy của người gửi |

Chi tiết schema có trong thư mục `supabase/migrations/`.

## API Endpoints

### Email
- `GET /api/emails` - Danh sách email
- `GET /api/emails/[id]` - Chi tiết email
- `POST /api/emails/send` - Gửi email
- `POST /api/emails/batch` - Thao tác hàng loạt

### AI Features
- `POST /api/ai/classify` - Phân loại email
- `POST /api/ai/smart-reply` - Gợi ý trả lời
- `POST /api/ai/features/[emailId]` - Tất cả AI features cho 1 email

### Source Accounts
- `GET /api/source-accounts` - Danh sách tài khoản
- `POST /api/source-accounts` - Thêm tài khoản IMAP
- `GET /api/source-accounts/google` - Bắt đầu OAuth Google

### CRON Jobs
- `POST /api/cron/sync-emails` - Đồng bộ email
- `POST /api/cron/classify-emails` - Phân loại email mới

## Deployment

### Vercel (Khuyến nghị)

1. Push code lên GitHub
2. Import project vào [Vercel](https://vercel.com)
3. Thêm environment variables
4. Deploy

### Render (cho background workers)

1. Tạo **Web Service** hoặc **Background Worker**
2. Dùng file `render.yaml` có sẵn
3. Thêm environment variables

### Docker

```bash
# Build
docker build -t inboxai .

# Run
docker run -p 3000:3000 --env-file .env.local inboxai
```

## Mobile Apps (Capacitor)

### Android

```bash
# Sync
npx cap sync android

# Mở Android Studio
npx cap open android

# Build APK
# Trong Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
```

Cần thiết lập keystore riêng:
```bash
# Tạo keystore mới
keytool -genkey -v -keystore android/your-release.keystore -alias your-alias -keyalg RSA -keysize 2048 -validity 10000

# Set environment variables
export KEYSTORE_PASSWORD=your-password
export KEY_ALIAS=your-alias
export KEY_PASSWORD=your-password
```

### iOS

```bash
# Sync
npx cap sync ios

# Mở Xcode
npx cap open ios
```

## Cấu Trúc Thư Mục

```
ai-mailbox/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Trang login, signup
│   │   ├── (dashboard)/       # Trang chính (inbox, compose, settings)
│   │   ├── (protected)/       # Trang admin
│   │   └── api/               # API endpoints
│   ├── components/            # React components
│   ├── contexts/              # React contexts
│   ├── hooks/                 # Custom hooks
│   ├── lib/                   # Business logic
│   │   ├── ai/               # AI modules (18 files)
│   │   ├── email/            # IMAP/SMTP clients
│   │   └── supabase/         # Database utilities
│   └── types/                 # TypeScript types
├── public/                    # Static files, PWA icons
├── scripts/                   # Utility scripts
├── supabase/                  # Migrations
├── android/                   # Android app (Capacitor)
└── ios/                       # iOS app (Capacitor)
```

## Scripts

```bash
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
```

## Đóng Góp

1. Fork repository
2. Tạo branch: `git checkout -b feature/ten-tinh-nang`
3. Commit: `git commit -m "feat: Thêm tính năng X"`
4. Push: `git push origin feature/ten-tinh-nang`
5. Tạo Pull Request

### Quy Ước Commit

```
feat: Thêm tính năng mới
fix: Sửa lỗi
docs: Cập nhật tài liệu
style: Format code
refactor: Tái cấu trúc code
test: Thêm tests
chore: Công việc bảo trì
```

## License

MIT License - Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

## Liên Hệ

- Email: support@inboxai.vn
- Website: [inboxai.vn](https://inboxai.vn)

---

Made with passion in Vietnam
