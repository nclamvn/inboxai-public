# InboxAI - Bản ghi nhớ công việc

## Cập nhật lần cuối: 2025-12-17

---

## Đã hoàn thành

### 1. Hệ thống Waitlist (DONE)
- [x] Landing page form có error/success feedback
- [x] API `/api/waitlist` - đăng ký waitlist với rate limiting
- [x] API `/api/check-whitelist` - kiểm tra email đã được duyệt chưa
- [x] API `/api/signup-whitelist` - đăng ký tài khoản (auto-confirm email)
- [x] API `/api/admin/whitelist` - admin quản lý whitelist (GET/POST/PATCH/DELETE)
- [x] Email xác nhận khi đăng ký waitlist
- [x] Email thông báo khi admin approve
- [x] Admin dashboard hiển thị và duyệt requests

### 2. Signup Flow (DONE)
- [x] Bước 1: Nhập email → kiểm tra whitelist
- [x] Nếu approved → hiện form đăng ký (name + password)
- [x] Nếu chưa approved → hiện form đăng ký waitlist
- [x] User được duyệt tự động confirm email (không cần verify)

### 3. Bugs đã fix
- [x] Cột `name` không tồn tại → đổi thành `full_name`
- [x] NOT NULL constraint trên `full_name` → default 'Waitlist User'
- [x] CORS OPTIONS handler cho PATCH requests
- [x] Domain redirect issue (inboxai.vn vs www.inboxai.vn)

---

## Cấu hình quan trọng

### Environment Variables (Render)
```
NEXT_PUBLIC_APP_URL=https://www.inboxai.vn
NEXT_PUBLIC_SUPABASE_URL=***
NEXT_PUBLIC_SUPABASE_ANON_KEY=***
SUPABASE_SERVICE_ROLE_KEY=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=noreply@inboxai.vn
```

### Admin Emails
File: `src/app/api/admin/whitelist/route.ts`
```typescript
const ADMIN_EMAILS = ['nclamvn@gmail.com']
```

### Database Tables
- `access_requests` - waitlist requests (id, email, full_name, status, created_at)
- `whitelist` - approved emails (id, email, is_active, notes, added_by)
- `profiles` - user profiles

---

## Cần lưu ý

### Domain
- Luôn dùng `www.inboxai.vn` (không phải `inboxai.vn`)
- Cloudflare đang redirect non-www → www
- Cookies session chỉ hoạt động đúng trên www domain

### Email Templates
File: `src/lib/resend/waitlist-emails.ts`
- `sendWaitlistConfirmation()` - gửi khi đăng ký waitlist
- `sendWaitlistApproval()` - gửi khi admin approve

---

## Có thể làm tiếp

1. **Cải thiện Admin Dashboard**
   - Thêm search/filter cho requests
   - Bulk approve/reject
   - Export danh sách

2. **Email Templates**
   - Cải thiện design email
   - Thêm unsubscribe link

3. **Analytics**
   - Theo dõi conversion rate waitlist → signup
   - Dashboard stats

4. **Security**
   - Rate limiting cho signup
   - Captcha cho waitlist form

---

## Files chính

```
src/
├── app/
│   ├── (auth)/signup/page.tsx          # Signup page với whitelist check
│   ├── (protected)/admin/page.tsx      # Admin dashboard
│   ├── api/
│   │   ├── waitlist/route.ts           # Đăng ký waitlist
│   │   ├── check-whitelist/route.ts    # Kiểm tra whitelist
│   │   ├── signup-whitelist/route.ts   # Đăng ký account
│   │   └── admin/whitelist/route.ts    # Admin API
│   └── page.tsx                        # Landing page
├── lib/
│   └── resend/
│       ├── client.ts                   # Resend client
│       └── waitlist-emails.ts          # Email templates
```

---

## Khi quay lại

Nói "tiếp tục" hoặc mô tả công việc cần làm. Tôi sẽ đọc file này để hiểu context.
