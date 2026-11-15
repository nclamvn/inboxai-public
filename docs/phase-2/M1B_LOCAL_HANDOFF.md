# M1-B Sync Contracts: local handoff

Ngày 11/11/2026, nhánh `phase2/m0-security-baseline-20261111`.
Baseline M1-A: `028aee1`. Mã bàn giao: `a817fe8`, gồm foundation `42905bb`,
tích hợp `92fc128`, rehearsal `a817fe8`. Commit báo cáo tiếp theo chỉ thay đổi
tài liệu và bằng chứng. Không push, PR từ xa, hosted migration, deploy hoặc email thật.

**Hoàn thành phạm vi M1-B local đã mô tả dưới đây. Security gate cho email thật và
production vẫn CLOSED.** Chưa xác nhận tương thích provider thật hoặc production readiness.

## Kết quả

- Gmail đọc đủ các trang, giữ history anchor dưới dạng chuỗi, lưu công việc history
  lớn thành các phần có thể tiếp tục. History hết hạn chuyển sang full rebaseline.
- IMAP INBOX quét UID tăng dần với UIDVALIDITY và giới hạn snapshot; khôi phục sau
  restart, nhận diện epoch mới, cập nhật cờ và ghi nhận thư bị expunge bằng tombstone.
- Lưu email, metadata attachment và checkpoint trong cùng giao dịch. Lỗi giữa trang
  không để lại dữ liệu một phần hoặc tiến checkpoint. Phản hồi commit bị mất được
  phục hồi bằng trạng thái database, không suy đoán rồi ghi đè.
- Lease, fence, revision và retry delay tồn tại trong schema riêng. Worker cũ không
  được commit/release sau khi lease đã được thay thế. Selector công việc tránh
  lease/backoff và ưu tiên tài khoản chưa xử lý, dùng chung cho cron và API nhiều tài khoản.
- Identity được phân theo account/provider/UID epoch, không dùng RFC Message-ID làm
  khóa duy nhất xuyên tài khoản. Metadata MIME phân theo part key, giữ filename trùng.
  Replay giữ email/attachment ID, AI/user annotations và cờ local đang chờ provider xác nhận.
- Các đường sync dùng credential vault; cron và multi-account API chọn đúng Gmail
  OAuth/IMAP. Lazy body/attachment không được đọc UID thuộc epoch cũ. Trạng thái
  `pending` được trả rõ thay vì trình bày sync chưa xong là hộp thư không có email mới.
- Tái sử dụng Gmail MIME helpers, mailparser, ImapFlow và kiến trúc Next/Supabase.
  Không thêm model, queue hoặc autonomous agent.

Chi tiết giao dịch, giới hạn, dependency, acceptance và recovery:
[SYNC_CONTRACTS.md](SYNC_CONTRACTS.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Bằng chứng thực tế

Môi trường: macOS arm64, Node 24.14.1, npm 11.11.0, PostgreSQL Homebrew 16.14,
Next 16.4.6. Trước build còn 45 GiB, trên ngưỡng 10 GB. Build dùng môi trường
allowlist với khóa giả lập; không kế thừa provider/Sentry credentials của shell.
Không cài thêm dependency hoặc tạo bản sao dự án trong M1-B.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | Exit 0; 0 lỗi, 97 cảnh báo | [log](evidence/m1b-lint.log) |
| `npm run typecheck` | Exit 0 | [log](evidence/m1b-typecheck.log) |
| `npm run test:unit` | Exit 0; 78/78, 10 files | [log](evidence/m1b-unit.log) |
| `npm run test:integration` | Exit 0; 153/153, 11 files | [log](evidence/m1b-integration.log) |
| `npm run test:db` | Exit 0; 12 migration, tenant/admission/vault/sync SQL scenarios | [log](evidence/m1b-db.log) |
| `npm run test:local-auth` | Exit 0; 61/61 kịch bản, gồm 35 hồi quy Auth/vault và 26 sync | [log](evidence/m1b-local-auth.log), [JSON](evidence/m1b-local-auth.json) |
| `npm run build` | Exit 0; compile, TypeScript và prerender hoàn tất | [log](evidence/m1b-build.log) |
| `npm audit --audit-level=high` | Exit 0; vẫn còn 11 moderate, không high/critical trong lần audit này | [log](evidence/m1b-audit.log) |
| `git diff --check` | Exit 0 trước bàn giao | Git local |

Unit/integration có **231 ca khác nhau**. Không cộng các lượt chạy lặp hoặc dùng số
ca để suy ra chất lượng AI/sản phẩm. Native rehearsal chạy GoTrue/PostgREST/PostgreSQL
thật trong local với provider readers giả lập. HTTP/ImapFlow transport được stub;
MIME fixture được parse bằng mailparser thật. Không gọi Gmail, IMAP/SMTP bên ngoài
hoặc LLM. Thư xác minh `.test` chỉ đi vào SMTP sink nội bộ.

Các tình huống gồm backlog 121 thư, history chứa nhiều ID hơn kích thước trang,
source/SQL failure, cursor restart, hai account có cùng provider/RFC ID, tenant khác,
flags/expunge, UID reset cả giữa trang, lease đồng thời và disabled account. Lease
expiry/backoff được điều khiển bằng fixture SQL; không dùng chúng để khẳng định SLA.
Mất phản hồi commit được chèn lỗi ở client sau một commit database thật, không phải
thử mất mạng ngoài thực tế. Native đọc/ghi và RLS đi qua HTTP PostgREST thực.

## Vấn đề được phát hiện và sửa

Các lượt đầu chưa đạt; các log trên là kết quả cuối sau sửa:

- Code cũ dùng cột `body_fetched` và metadata attachment chưa có trong migrations;
  recipient columns thực tế là JSONB. Migration tiến tới bổ sung thiếu hụt và RPC
  sử dụng đúng kiểu, kiểm thử có ghi message/attachment hợp lệ và rollback khi lỗi.
- Trigger phishing cũ gọi helper không đầy đủ schema, thất bại khi INSERT từ RPC có
  search path rỗng. Đã định nghĩa lại ở migration mới, giữ nguyên ý nghĩa tính risk.
- Lint quét thư mục PostgreSQL tạm đúng lúc harness xóa thư mục. Chỉ thêm ignore cho
  `.codex-db-test-*`, không loại source hoặc tắt rule. Fixture/mocks cũ được cập nhật
  theo RPC mới; không bỏ assertion, không dùng credentials thật để làm test xanh.
- Replay ban đầu có thể ghi đè cờ local hoặc ghép hai attachment trùng filename.
  Last-provider flags và MIME part identity được bổ sung, kiểm chứng qua database thật.
- Gmail body-part failure không được xem là message GET 404; phần text tham chiếu
  được tải riêng, filename attachment không được dùng thay body. Preview Unicode
  không cắt đôi surrogate của emoji tại giới hạn lưu trữ.

## Giới hạn và bước tiếp theo

**M1-C: Gmail OAuth send và external-send idempotency** là milestone tiếp theo.
Không tự mở cổng dùng mail thật sau kết quả M1-B.

M1-B hiện hỗ trợ IMAP INBOX; chưa có multi-folder/QRESYNC/CONDSTORE. Quét lại cờ có
chi phí cần đo trên mailbox lớn. Parse IMAP giới hạn 10 MiB/message và 100 attachments;
page quá lớn/lỗi bị chặn có trạng thái lỗi, giữ checkpoint để sửa, không âm thầm bỏ
qua. Gmail có giới hạn MIME/worklist; download file attachment và push chưa triển khai.
Cần streaming/large-message support và provider interoperability trước real-mail gate.

Migration giữ các dòng lịch sử dưới namespace legacy và rebaseline. Dòng cũ được
retire sau scan hoàn chỉnh, vẫn giữ evidence/annotations; chưa tự merge annotations
sang identity mới. Hosted preflight phải kiểm tra schema, constraint, duplicate và
mapping lịch sử thực tế. Không kiểm chứng dữ liệu hosted, backup restore, remote CI,
branch protection, tải vận hành hay các luồng AI/classification với dịch vụ thật.
Mirror còn sửa được theo quyền owner, chưa phải immutable evidence ledger của M3.

Không có chứng nhận penetration test, độ chính xác model, hiệu năng provider hoặc
lợi thế so với LLM/agent trực tiếp. M1-B là cơ chế xác thực/trạng thái tất định;
đối chứng chất lượng AI và giá trị người dùng thuộc các milestone sản phẩm sau.

## Vệ sinh và rollback

Đã dừng/xóa PostgreSQL `.codex-db-test-*` sau mỗi lượt, kể cả lượt lỗi. Fixture riêng
đã compose down 5 container và 2 network; không prune volume/container dự án khác.
`docker image prune -f` trả về 0 B. Chỉ dùng `.next`; không tạo distDir, project copy,
venv hoặc dependency install ngoài checkout. Log tổng hợp trung gian đã bỏ; giữ các
log cuối riêng ở trên và manifest hash nguồn/bằng chứng.

Rollback không chạy lại sync cũ với schema mới. Giữ worker đóng, giữ committed
pages/tombstones/private state; sửa đúng scope và cho code mới reclaim lease hết hạn.
Không xóa evidence hoặc ép lại constraint cũ trên các bản sao xuyên tài khoản hợp lệ.
Hosted cutover/rollback vẫn cần rehearsal và thẩm quyền riêng.
