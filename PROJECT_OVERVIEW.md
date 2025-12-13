# AI Mailbox - Tổng Quan Dự Án

> **Phiên bản:** 0.1.0
> **Ngày cập nhật:** 13/12/2025
> **Trạng thái:** Đang phát triển tích cực

---

## 1. Giới Thiệu

**AI Mailbox** là một hệ thống quản lý email thông minh sử dụng trí tuệ nhân tạo, được thiết kế đặc biệt cho người dùng Việt Nam. Dự án cung cấp các tính năng tổ chức email tự động, phân tích nội dung, và tự động hóa workflow email.

### Điểm Nổi Bật
- Phân loại email tự động bằng AI (GPT-4o-mini)
- Hỗ trợ đầy đủ tiếng Việt
- Tích hợp IMAP/SMTP cho mọi nhà cung cấp email
- Theo dõi follow-up thông minh
- Báo cáo insights hàng tuần
- Giao diện responsive với Dark/Light mode

---

## 2. Công Nghệ Sử Dụng

### Frontend
| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| Next.js | 16.0.10 | Framework React với App Router |
| React | 19.2.1 | UI Library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| TanStack React Query | 5.90.12 | Server state management |
| TanStack React Virtual | 3.13.13 | Virtualized lists |
| Lucide React | 0.556.0 | Icons |

### Backend & Database
| Công nghệ | Mục đích |
|-----------|----------|
| Supabase | PostgreSQL Database + Auth |
| OpenAI GPT-4o-mini | AI Classification & Generation |
| Anthropic Claude | AI (cấu hình sẵn, dự phòng) |
| Resend | Email delivery service |
| IMAP/SMTP | Email protocol (imapflow, nodemailer) |

### Deployment
| Platform | Mục đích |
|----------|----------|
| Vercel | Web application hosting |
| Render | Background worker & cron jobs |

---

## 3. Cấu Trúc Dự Án

```
ai-mailbox/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Login, Signup pages
│   │   ├── (dashboard)/       # Protected pages (inbox, compose, settings...)
│   │   ├── (protected)/       # Admin pages
│   │   └── api/               # 81 API endpoints
│   ├── components/            # React components (18 categories)
│   │   ├── ai/               # AI assistant, urgent alerts
│   │   ├── email/            # Email list, detail, smart inbox
│   │   ├── follow-up/        # Follow-up tracking
│   │   ├── insights/         # Weekly reports
│   │   ├── notifications/    # Notification dropdown
│   │   ├── settings/         # Account management
│   │   └── ui/               # Design system components
│   ├── contexts/             # React contexts (theme, selections)
│   ├── hooks/                # Custom hooks (7 files)
│   ├── lib/                  # Core business logic
│   │   ├── ai/              # 18 AI modules
│   │   ├── email/           # IMAP/SMTP clients
│   │   └── supabase/        # Database utilities
│   └── types/               # TypeScript definitions
├── public/                   # Static assets, PWA icons
├── scripts/                  # Utility scripts
├── supabase/                # Database config & migrations
└── [config files]           # next.config, tailwind.config, etc.
```

### Thống Kê
- **174** TypeScript/TSX files
- **81** API endpoints
- **18** component categories
- **7** custom React hooks

---

## 4. Tính Năng Chính

### 4.1 Quản Lý Email
| Tính năng | Mô tả |
|-----------|-------|
| Smart Inbox | Inbox thông minh với bộ lọc AI |
| Multi-account | Kết nối nhiều tài khoản email |
| IMAP Sync | Đồng bộ email mỗi 2 phút |
| Email Compose | Soạn email với AI hỗ trợ |
| Attachment Support | Hỗ trợ đính kèm |

### 4.2 AI Features
| Tính năng | Mô tả |
|-----------|-------|
| Auto Classification | Phân loại tự động: work, personal, transaction, newsletter, promotion, social, spam |
| Priority Detection | Đánh giá độ ưu tiên 1-5 |
| AI Summary | Tóm tắt nội dung email dài |
| Smart Reply | Gợi ý câu trả lời thông minh |
| Action Extraction | Trích xuất tasks, deadlines, câu hỏi |
| Follow-up Detection | Phát hiện email cần follow-up |
| Sender Insights | Phân tích sender patterns |

### 4.3 Automation
| Tính năng | Mô tả |
|-----------|-------|
| Rules Engine | Tạo rules tự động hóa |
| Auto Archive | Tự động archive theo điều kiện |
| Label Assignment | Gán nhãn tự động |
| Unsubscribe Management | Quản lý và hủy đăng ký newsletters |

### 4.4 Analytics & Insights
| Tính năng | Mô tả |
|-----------|-------|
| Weekly Reports | Báo cáo email hàng tuần |
| Productivity Score | Điểm năng suất (0-100) |
| Category Breakdown | Phân tích theo danh mục |
| Top Senders | Thống kê người gửi |
| Trend Analysis | So sánh tuần này vs tuần trước |

---

## 5. AI Pipeline - Kiến Trúc 4 Pha

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  Phase 1        │    │  Phase 2         │    │  Phase 3        │    │  Phase 4         │
│  Rule-based     │───►│  Keyword         │───►│  AI/GPT         │───►│  Hybrid +        │
│  Classification │    │  Scoring         │    │  Classification │    │  Trust Override  │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └──────────────────┘
     │                       │                       │                       │
     ▼                       ▼                       ▼                       ▼
Vietnamese domains    Secondary signal      GPT-4o-mini           Sender trust
Bank detection        for uncertain         with Vietnamese       adjustment
OTP patterns          cases                 prompts               Final result
```

### Confidence Scoring
- Mỗi phân loại có `ai_confidence` từ 0-1
- Rule-based: 0.9+ confidence
- AI classification: Variable
- User feedback cải thiện theo thời gian

---

## 6. Database Schema

### Bảng Chính

#### emails
```sql
- id, user_id, message_id, thread_id
- from_address, from_name, to_addresses, cc_addresses
- subject, body_text, body_html, snippet
- received_at, created_at, updated_at
- is_read, is_starred, is_archived, is_deleted
- priority (1-5), category, summary
- detected_deadline, needs_reply
- ai_confidence, ai_suggestions (JSONB)
- source_account_id, original_uid
```

#### source_accounts
```sql
- id, user_id, email_address, display_name
- provider (Gmail, Outlook, Yahoo, custom...)
- imap_host, imap_port, imap_secure
- smtp_host, smtp_port, smtp_secure
- username, password_encrypted (AES-256-CBC)
- is_active, last_sync_at, sync_error
```

#### profiles
```sql
- id, email, mailbox_address
- display_name, avatar_url
- settings (JSONB)
```

### Security
- Row Level Security (RLS) trên tất cả bảng
- Mật khẩu email được mã hóa AES-256-CBC
- Whitelist access control

---

## 7. API Endpoints (81 routes)

### Email Operations
```
GET/POST  /api/emails           - List/create emails
GET       /api/emails/[id]      - Get email detail
GET       /api/emails/search    - Search emails
POST      /api/emails/send      - Send email
POST      /api/emails/bulk-action - Bulk operations
```

### AI Features
```
POST  /api/ai/classify         - Classify single email
POST  /api/ai/classify-batch   - Batch classification
POST  /api/ai/smart-reply      - Generate replies
POST  /api/ai/summary          - Summarize email
POST  /api/ai/extract-actions  - Extract action items
POST  /api/ai/urgent-check     - Check urgent emails
POST  /api/ai/feedback         - User feedback
```

### Account Management
```
GET/POST  /api/source-accounts        - List/add accounts
POST      /api/source-accounts/sync   - Sync all accounts
```

### Follow-ups & Actions
```
GET/POST  /api/follow-ups       - Manage follow-ups
GET/POST  /api/action-items     - Manage action items
```

### Automation
```
GET/POST  /api/automation/rules - Manage rules
POST      /api/automation/run   - Execute rules
```

---

## 8. Trạng Thái Hiện Tại

### Git Status
**Branch:** main

### Commits Gần Đây
| Commit | Nội dung |
|--------|----------|
| 2ddbdfb | Feature: Add Delete All button to Trash page |
| 30048f1 | Fix: Improve light theme contrast for badges |
| f5f9a44 | Update PWA icons with new design |
| 6981ef3 | Fix: Lazy init Supabase in api/ai/feedback route |
| f9d25e4 | Fix: Lazy init Supabase in admin/whitelist route |

### Thay Đổi Chưa Commit (20 files)
Tất cả thay đổi liên quan đến cải thiện **light theme contrast cho badges**:

```
src/app/(dashboard)/actions/page.tsx
src/app/(dashboard)/follow-ups/page.tsx
src/app/(dashboard)/subscriptions/page.tsx
src/app/(protected)/admin/page.tsx
src/components/ai/urgent-alert.tsx
src/components/email/action-items-card.tsx
src/components/email/ai-summary.tsx
src/components/email/email-detail-full.tsx
src/components/email/email-detail.tsx
src/components/email/email-list-compact.tsx
src/components/email/email-list-virtual.tsx
src/components/email/filter-chips.tsx
src/components/email/smart-inbox.tsx
src/components/email/smart-reply.tsx
src/components/follow-up/follow-up-badge.tsx
src/components/insights/weekly-report.tsx
src/components/notifications/notification-dropdown.tsx
src/components/settings/add-account-modal.tsx
src/components/settings/source-accounts-section.tsx
src/components/ui/badge.tsx
```

**Tổng thay đổi:** 89 insertions, 89 deletions (refactoring)

### Tính Năng Đã Hoàn Thành
- [x] Multi-account email sync (IMAP)
- [x] AI classification pipeline (4 phases)
- [x] Smart reply generation
- [x] Action items extraction
- [x] Follow-up intelligence
- [x] Weekly insights reports
- [x] Dark/Light theme
- [x] PWA support
- [x] Virtualized email list
- [x] Bulk operations (archive, delete, mark read)
- [x] Unsubscribe management
- [x] Search with history
- [x] Automation rules engine

---

## 9. Định Hướng Phát Triển

### Ngắn Hạn (Ưu tiên cao)

#### 9.1 Cải Thiện UX/UI
- [ ] Hoàn thiện light theme contrast
- [ ] Keyboard shortcuts cho power users
- [ ] Drag & drop để di chuyển email
- [ ] Email threading view cải tiến

#### 9.2 AI Enhancements
- [ ] Fine-tune model cho Vietnamese emails
- [ ] Cải thiện accuracy từ user feedback
- [ ] Phishing/spam detection nâng cao
- [ ] Email priority prediction dựa trên behavior

#### 9.3 Performance
- [ ] Optimize sync performance cho large mailboxes
- [ ] Implement incremental sync
- [ ] Cache layer cho AI responses
- [ ] Background classification queue

### Trung Hạn

#### 9.4 Tính Năng Mới
- [ ] Email templates với AI generation
- [ ] Email scheduling (gửi sau)
- [ ] Snooze emails (nhắc lại sau)
- [ ] Quick actions từ notifications
- [ ] Signature management

#### 9.5 Integrations
- [ ] Google Calendar sync (deadline → event)
- [ ] Slack notifications
- [ ] Webhook support cho third-party apps
- [ ] Chrome extension

#### 9.6 Analytics Nâng Cao
- [ ] Response time analytics
- [ ] Email sentiment analysis
- [ ] Communication network visualization
- [ ] Export reports (PDF, CSV)

### Dài Hạn

#### 9.7 Enterprise Features
- [ ] Team collaboration
- [ ] Shared inboxes
- [ ] Admin dashboard
- [ ] Audit logs
- [ ] SSO integration (SAML, OIDC)

#### 9.8 Mobile
- [ ] React Native mobile app
- [ ] Push notifications
- [ ] Offline mode
- [ ] Quick compose widget

#### 9.9 AI Nâng Cao
- [ ] Custom AI models per user
- [ ] Meeting scheduling assistant
- [ ] Email drafting với context awareness
- [ ] Anomaly detection (unusual sender behavior)

#### 9.10 Đa Ngôn Ngữ
- [ ] English UI support
- [ ] Multilingual AI classification
- [ ] Auto-detect email language

---

## 10. Kiến Trúc Deployment

```
                    ┌─────────────────────────────────────────────┐
                    │                  Internet                    │
                    └─────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
           ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
           │    Vercel    │      │   Resend     │      │   OpenAI     │
           │   (Next.js)  │      │  (Email API) │      │  (GPT-4o)    │
           └──────────────┘      └──────────────┘      └──────────────┘
                    │                     │                     │
                    │                     │                     │
                    ▼                     ▼                     │
           ┌──────────────────────────────────────────────────────────┐
           │                        Supabase                          │
           │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
           │  │ PostgreSQL  │  │    Auth     │  │   Storage   │      │
           │  └─────────────┘  └─────────────┘  └─────────────┘      │
           └──────────────────────────────────────────────────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
           ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
           │    Gmail     │      │   Outlook    │      │    Other     │
           │   (IMAP)     │      │   (IMAP)     │      │   Providers  │
           └──────────────┘      └──────────────┘      └──────────────┘
```

---

## 11. Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI
OPENAI_API_KEY=

# Anthropic (backup)
ANTHROPIC_API_KEY=

# Resend
RESEND_API_KEY=

# Email encryption
EMAIL_ENCRYPTION_KEY=

# App
NEXT_PUBLIC_APP_URL=
```

---

## 12. Scripts

```bash
# Development
npm run dev          # Start development server

# Build
npm run build        # Production build

# Production
npm run start        # Start production server

# Linting
npm run lint         # Run ESLint

# Utilities
npm run generate-icons   # Generate PWA icons
npm run cron:sync        # Manual email sync
```

---

## 13. Liên Hệ & Đóng Góp

### Repository Structure
- `main` branch: Production-ready code
- Feature branches: `feature/*`
- Bug fixes: `fix/*`

### Commit Convention
```
Feature: [description]
Fix: [description]
Update: [description]
Refactor: [description]
```

---

*Tài liệu được tạo tự động bởi AI Mailbox Documentation System*
