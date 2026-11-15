# M1-A Credential Vault: local handoff

Ngày 11/11/2026. Nhánh `phase2/m0-security-baseline-20261111`.
Baseline trước M1-A: `edd0954`. Mã đã kiểm chứng: `656cb52`, gồm nền tảng
`2bb1e58`, tích hợp `7fa28f0` và rehearsal `656cb52`. Commit báo cáo kế tiếp
chỉ cập nhật tài liệu và bằng chứng. Không push, tạo PR từ xa, deploy, thay đổi
hosted settings hoặc dùng hộp thư thật.

**Kết quả: hoàn thành phạm vi M1-A ở local. Security gate cho email thật và
production vẫn CLOSED.** Đây là bằng chứng kỹ thuật trong phạm vi kiểm thử,
không phải chứng nhận an toàn hoặc hoàn tất toàn bộ M1.

## Thay đổi và lý do

- Bí mật được mã hóa AES-256-GCM phía server, ràng buộc user/account bằng AAD,
  có phiên bản và key ID. Thiếu/sai khóa, sửa envelope hoặc tráo tenant bị từ chối.
- Migration tiến tới gỡ sáu cột chứa token/password khỏi `public.source_accounts`.
  RLS, quyền schema riêng và RPC chỉ dành cho service role được kiểm tra trực tiếp.
  Trình duyệt vẫn đọc được metadata tài khoản của chính mình.
- Dữ liệu cũ được cách ly nguyên trạng trong schema riêng rồi chuyển đổi tường minh.
  Luồng đọc thông thường không tự dùng plaintext/CBC. Bản ghi mâu thuẫn giữ nguyên
  để xử lý riêng; chuyển đổi thành công mới xóa packet cũ.
- Hai callback OAuth, tạo tài khoản IMAP, token refresh, đọc password cho SMTP,
  đồng bộ/nội dung IMAP và attachment dùng vault. Google refresh giữ refresh token
  khi provider không trả token mới; lỗi lưu/xung đột không trả token chưa được lưu.
- Tạo metadata và credential là một giao dịch; ghi đồng thời dùng revision/CAS.
  Xoay khóa mã hóa lại cả bản hiện tại và một bản trước đó. Restore dùng envelope
  mới, không khôi phục cột plaintext hoặc hạ mức bảo vệ.
- CLI chỉ cho loopback, mặc định dry run, giới hạn 50 tài khoản mỗi lượt và có cursor.
  Đã kiểm thử migrate/rotate/restore/inventory, từ chối URL hosted và không xuất bí mật.

Hợp đồng kiến trúc, cách vận hành, dependency và acceptance criteria nằm trong
[CREDENTIAL_VAULT.md](CREDENTIAL_VAULT.md), [AGENTS.md](../../AGENTS.md) và
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Không đổi giao diện hay bốn trụ cột.

## Kiểm chứng thực tế

macOS 27.2 arm64, Node 24.14.1, npm 11.11.0, PostgreSQL Homebrew 16.14;
Next 16.4.6. Trước build còn 46 GiB, trên ngưỡng 10 GB. Build dùng môi trường
allowlist và khóa giả lập; không kế thừa Sentry/provider credentials của shell.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | Exit 0, 0 lỗi, 103 cảnh báo; không tắt rule | [log](evidence/m1a-lint.log) |
| `npm run typecheck` | Exit 0 | [log](evidence/m1a-typecheck.log) |
| `npm run test:unit` | Exit 0, 70/70, 9 files | [log](evidence/m1a-unit.log) |
| `npm run test:integration` | Exit 0, 123/123, 8 files; DB/provider mock | [log](evidence/m1a-integration.log) |
| `npm run test:db` | Exit 0; 11 migration, bootstrap và fixture upgrade tổng hợp; SQL tenant/admission/concurrency/vault | [log](evidence/m1a-db.log) |
| `npm run test:local-auth` | Exit 0, 35/35 kịch bản, gồm 14 hồi quy Auth và 21 kiểm tra vault | [log](evidence/m1a-local-auth.log), [JSON](evidence/m1a-local-auth.json) |
| `npm run build` | Exit 0; compile, TypeScript, prerender hoàn tất; có cảnh báo deprecation Sentry | [log](evidence/m1a-build.log) |
| `npm audit --audit-level=high` | Exit 0; vẫn còn 11 moderate, không high/critical trong lần audit này | [log](evidence/m1a-audit.log) |
| `git diff --check` | Exit 0 trước bàn giao | Kiểm tra Git local |

Hai suite unit/integration có tổng 193 ca khác nhau; không cộng lại các lần chạy
lặp. SQL và native rehearsal là lớp bằng chứng riêng, không suy ra chất lượng
sản phẩm hay năng lực AI từ số test.

Native rehearsal dùng GoTrue 2.197.0, PostgREST 14.18, PostgreSQL 16, Mailpit 1.28.1
trong mạng Docker nội bộ; gateway chỉ publish loopback. Thư xác minh `.test` chỉ
vào SMTP sink nội bộ. Google, Gmail, IMAP/SMTP bên ngoài và LLM không được gọi.
Kiểm tra bao gồm đọc metadata bằng JWT thật, từ chối browser RPC/private schema,
chuyển đổi CBC/OAuth, cách ly xung đột, đúng một writer thắng, rotate/retire/restore,
không kích hoạt lại account bị khóa, tag bị sửa và pagination 53 tài khoản.

## Lỗi phát hiện trong quá trình kiểm chứng

Các lượt đầu chưa đạt, đã sửa trước các log cuối được lưu:

1. Trigger primary-account cũ dùng tên bảng không đầy đủ, lỗi trong RPC có search
   path rỗng. Migration mới định nghĩa lại trigger với schema tường minh.
2. PostgreSQL không hỗ trợ lượng lặp regex 65536 trong kiểm tra ciphertext.
   Thay bằng giới hạn độ dài riêng và kiểm tra bảng ký tự; bổ sung ghi hợp lệ vào SQL test.
3. SQLSTATE 40001 làm PostgREST 14 thử lại xung đột nghiệp vụ đến timeout.
   Thay bằng PT409 và kiểm chứng đồng thời qua HTTP thật. Nguồn đối chiếu:
   [Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
4. Harness gọi CLI đồng bộ làm chặn proxy cùng tiến trình. Chuyển sang child process
   bất đồng bộ có timeout; không thay đổi yêu cầu hay bỏ assertion để làm test xanh.

## Giới hạn và milestone kế tiếp

Keyring hiện ở biến môi trường server, chưa tích hợp KMS/HSM hay chứng minh vận hành
khóa trên hosted. Packet legacy bị xung đột còn chứa bí mật cũ trong schema riêng;
backup cũ trước migration vẫn cần chính sách bảo vệ/retention. CBC không có xác thực
nên không thể chứng minh dữ liệu lịch sử chưa bị sửa chỉ bằng giải mã thành công.
Một bản credential trước đó được giữ dưới dạng mã hóa; chưa có TTL tự động.

Chưa chạy provider thật, penetration test, hosted upgrade/backup restore hay remote
CI/branch protection. Restore không chứng minh token vẫn còn hiệu lực ở provider.
Gmail OAuth send vẫn thuộc M1-C; luồng SMTP từ chối credential Google. Độ bền sync,
paging/history/UIDVALIDITY và checkpoint chưa được sửa trong M1-A.

Bước tiếp theo là **M1-B Sync Contracts**, bắt đầu bằng fixture tổng hợp cho paging,
Gmail history expiry, IMAP UIDVALIDITY, duplicate/retry/restart và lease/checkpoint.
Tiếp tục local theo chỉ đạo hiện tại. Những công việc AI ở M2–M5 vẫn cần đối chứng
LLM/agent, dữ liệu mới, quality/privacy floors và phép đo giá trị riêng; vault là
ranh giới xác thực tất định, không đưa thêm model hoặc agent vào runtime.

## Vệ sinh và khôi phục

Các PostgreSQL `.codex-db-test-*` được dừng/xóa bằng EXIT trap, kể cả lượt lỗi.
Đã dừng/xóa 5 container và 2 network của riêng fixture bằng compose down. Không
prune container hoặc volume. `docker image prune -f` trả về 0 B; giữ nguyên image
có tag và container dự án khác. Chỉ dùng `.next`; không tạo distDir, project copy,
venv hoặc dependency install ngoài repository. Log tổng hợp trung gian đã được bỏ;
các log riêng cuối cùng ở trên là bằng chứng bàn giao.

Rollback: giữ worker đóng, giữ private/encrypted state và sửa đúng tài khoản/khóa.
Không chạy app cũ với schema mới, không khôi phục cột bí mật công khai. Cutover
schema/application phải đồng bộ và được rehearsal riêng trước khi đề xuất hosted.
