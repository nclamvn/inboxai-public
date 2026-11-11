# M3-A Commitment Ledger

Ngày 11/11/2026. Baseline `e1978e4`, nhánh
`phase2/m0-security-baseline-20261111`. Triển khai và kiểm thử trong checkout
local với thư và tài khoản giả lập.

Các đơn vị review local gồm `7c28580` cho PostgreSQL, `9fa4a7f` cho API
và `3453fe9` cho bộ kiểm thử với Auth và PostgREST.

## Hành vi

- Mỗi cam kết có UUID và `referenceKey` cố định trong phạm vi người dùng.
  Chọn mã theo đối tượng công việc, chẳng hạn `po-1042:delivery`. Hai cam
  kết trong cùng một email có thể dùng hai mã khác nhau. Đổi hạn hoặc người
  chịu trách nhiệm tạo phiên bản mới của đúng UUID.
- Một phiên bản lưu nội dung cam kết, tên và email người chịu trách nhiệm,
  hạn, trạng thái và trường đã thay đổi. Hạn theo ngày `dueOn` giữ nguyên
  ngày lịch. Hạn có giờ `dueAt` yêu cầu offset và được trả về theo UTC.
  Các trường chưa xác định có thể để `null`.
- Trạng thái được ghi theo quyết định rõ ràng của người dùng, gồm
  `open`, `completed` và `cancelled`. Một yêu cầu `flag_review` ghi
  nhận điểm mơ hồ hoặc mâu thuẫn, kèm ghi chú và chứng cứ, đồng thời giữ
  các điều khoản đã xác nhận. Mâu thuẫn giữa thư cần ít nhất hai email.
  Sau khi người dùng xác nhận bản sửa, phiên bản hiện hành bỏ cờ xem
  xét và giữ sự kiện cũ trong lịch sử.
- Mỗi phiên bản yêu cầu một đến ba trích đoạn nguyên văn từ tiêu đề hoặc
  nội dung văn bản của email thuộc người dùng. Nguồn có thể đến từ nhiều
  hộp thư cùng người dùng. Nếu email còn truy xuất được, API trả đường
  dẫn `/inbox?email=...`. Nếu đoạn nguồn đã đổi, API giữ đường dẫn và
  trả trạng thái `changed`. Nếu email bị xóa hoặc không còn truy xuất
  được, phiên bản và mã email nguồn vẫn còn với trạng thái `unavailable`.

## Hợp đồng API local

| Yêu cầu | Dữ liệu |
| --- | --- |
| `GET /api/commitments` | Danh sách phiên bản hiện hành. `limit` mặc định 20, tối đa 50. Dùng `nextBeforeId` từ phản hồi làm `beforeId` cho trang sau |
| `GET /api/commitments/{id}` | Phiên bản hiện hành và lịch sử mới nhất trước. Dùng `nextBeforeVersion` làm `beforeVersion`. Mỗi sự kiện trả `changedFields` và `sources` |
| `POST /api/commitments` | Gửi `referenceKey`, `state` và `evidence`. Nhận UUID và phiên bản |
| `PATCH /api/commitments/{id}` | Gửi `expectedVersion`, `operation` và `evidence`. Dùng `revise` với toàn bộ `state`, hoặc `flag_review` với `review` gồm `kind` và `note` |

Yêu cầu ghi dùng cookie phiên hoặc Bearer token, `Content-Type: application/json`
và `Idempotency-Key` UUIDv4. Giữ cùng mã cho lần thử lại của cùng một yêu cầu.
Phản hồi phát lại trả UUID và phiên bản ban đầu với `replayed: true`. Mã yêu
cầu dùng với dữ liệu khác, trùng mã cam kết hoặc phiên bản cũ trả HTTP 409.
Nguồn hoặc cam kết ngoài phạm vi được trả như tài nguyên không khả dụng.
Trích đoạn sai hoặc thiếu chứng cứ cho mâu thuẫn trả HTTP 422.

Ví dụ dữ liệu tạo cam kết với email giả lập đã có trong hộp thư local.

```json
{
  "referenceKey": "po-1042:delivery",
  "state": {
    "title": "Giao 200 bộ linh kiện",
    "ownerName": "Nhà cung cấp",
    "ownerEmail": "supplier@example.test",
    "dueOn": "2026-11-15",
    "dueAt": null,
    "status": "open"
  },
  "evidence": [
    {
      "emailId": "20000000-0000-4000-8000-000000000061",
      "field": "body_text",
      "quote": "Giao 200 bộ linh kiện vào 15/11."
    }
  ]
}
```

## Tính toàn vẹn và dữ liệu nguồn

[Migration](../../supabase/migrations/20261111060000_commitment_ledger.sql)
tạo bảng danh tính và bảng phiên bản trong schema riêng. RLS và quyền
mặc định chặn truy cập bảng trực tiếp. Các RPC lấy người dùng từ phiên
đăng nhập và ràng buộc mọi truy vấn theo người dùng đó. Khóa phiên bản
và ràng buộc khóa ngoại trì hoãn giúp phiên bản mới và con trỏ hiện hành
cùng commit. Một khóa yêu cầu tạo tối đa một phiên bản.

Bằng chứng lưu vị trí, độ dài và SHA-256 của trích đoạn. API kiểm tra
văn bản hiện tại ở đúng vị trí trước khi hiển thị trích dẫn. Thư đổi
bố cục có thể chuyển sang `changed` kể cả khi cùng cụm từ xuất hiện ở
vị trí khác. Xóa người dùng sẽ xóa sổ cam kết của họ. Các trường và
ghi chú do người dùng nhập được lưu trong phiên bản.

[Supabase database functions](https://supabase.com/docs/guides/database/functions) ·
[PostgreSQL transaction-level advisory locks](https://www.postgresql.org/docs/16/functions-admin.html) ·
[PostgreSQL binary string functions](https://www.postgresql.org/docs/16/functions-binarystring.html)

## Bằng chứng kiểm thử

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6 và PostgreSQL 16.
Còn 41 GiB trước build. Biến môi trường build dùng giá trị giả lập và cổng loopback.

| Lệnh | Kết quả | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | Exit 0, 91 cảnh báo và 0 lỗi | [Log](evidence/m3a-lint.log) |
| `npm run typecheck` | Exit 0 | [Log](evidence/m3a-typecheck.log) |
| `npm run test:unit` | Exit 0, 94/94 | [Log](evidence/m3a-unit.log) |
| `npm run test:integration` | Exit 0, 168/168 | [Log](evidence/m3a-integration.log) |
| `npm run test:db` | Exit 0, 15 migration và ca kiểm thử ledger trên PostgreSQL | [Log](evidence/m3a-db.log) |
| `npm run test:commitment-ledger` | Exit 0, 14 ca Auth/RLS và 18 ca ledger/API | [Log](evidence/m3a-local-auth.log), [JSON](evidence/m3a-local-auth.json) |
| `npm run test:local-auth` | Exit 0, 82/82 ca hồi quy Auth, vault, sync và gửi thư | [Log](evidence/m3a-regression.log), [JSON](evidence/m3a-regression.json) |
| `npm run build` | Exit 0, compile, TypeScript và prerender hoàn tất | [Log](evidence/m3a-build.log) |

Kiểm thử HTTP chạy Next.js, GoTrue, PostgREST và PostgreSQL local.
Hai người dùng và anonymous được kiểm tra riêng. Các ca đồng thời
kiểm tra tạo cùng yêu cầu và sửa cùng phiên bản. Fixture cũng chứng
minh đường dẫn trả về dẫn tới email có đúng nội dung và ngăn đọc,
sửa hoặc gắn email của người dùng khác.

Mẫu phản hồi thực tế có một UUID với bốn phiên bản. Cam kết giao 200 bộ
đổi hạn từ 15/11 sang 19/11, ghi nhận phiếu vận tải còn báo 18/11 và
hoàn tất sau xác nhận của kho. Đường dẫn trong mẫu thuộc fixture đã dọn.
[Mẫu JSON](evidence/m3a-sample-ledger.json)

## Phạm vi

M3-A cung cấp API và lịch sử. Xác nhận ngữ nghĩa của trích đoạn vẫn
thuộc người dùng. Bộ trích xuất cũ chưa ghi tự động vào ledger. Các
đầu việc và follow-up hiện có giữ dữ liệu của chúng. M3-B sẽ dùng API
để theo dõi cam kết, xác nhận nguồn và xử lý mâu thuẫn trên giao diện.
Chưa đánh giá chất lượng suy luận hoặc đối chứng LLM và agent.

Khi cần quay lui, có thể hoàn nguyên lớp ứng dụng và giữ migration
cộng thêm để bảo toàn lịch sử đã lưu. Kiểm thử sử dụng môi trường local,
và [security gate](SECURITY_GATE.md) tiếp tục áp dụng cho môi trường hosted.

Đã dọn PostgreSQL tạm, container và network Docker Compose, listener
loopback và thư mục chứng chỉ thử nghiệm. `docker image prune -f` thu hồi
0 B. Build dùng `.next` trong checkout hiện tại.
