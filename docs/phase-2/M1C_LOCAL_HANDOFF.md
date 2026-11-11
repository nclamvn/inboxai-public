# M1-C Gmail OAuth Send và idempotency

Ngày 11/11/2026. Nhánh `phase2/m0-security-baseline-20261111`, baseline `c788d8c`.
Ba commit mã và kiểm thử là `ec1f229` (giao dịch gửi), `f1a5af1` (tích hợp)
và `8d64591` (rehearsal). Triển khai và thử nghiệm trong checkout local với
địa chỉ `.test`. Security gate cho hộp thư thật và production vẫn đóng.

## Hành vi

- Compose gửi `Idempotency-Key` dạng UUID v4. Server xác thực người dùng, kiểm tra
  địa chỉ, giới hạn 50 người nhận và 2 MiB JSON, rồi băm nội dung đã chuẩn hóa.
  Cùng mã trong một tenant chỉ áp dụng cho cùng tài khoản và nội dung. Đổi nội dung
  với mã đã dùng trả HTTP 409. Tài khoản gửi phải hoạt động và thư gốc phải thuộc tenant.
- RPC giành quyền gửi ghi yêu cầu vào schema riêng trước khi provider được gọi.
  Chỉ request tạo bản ghi thành công được dispatch. Replay đang xử lý trả HTTP 202.
  Sau 90 giây, bản ghi dispatch bị bỏ dở chuyển sang chưa rõ kết quả khi được kiểm tra.
  Quyền dispatch cho mã đó đã tiêu thụ, kể cả khi tiến trình chết trước khi gọi provider.
- Gmail dùng access token từ vault và Nodemailer để tạo MIME base64url cho
  `messages.send`. Reply dùng RFC headers. Gmail thread chỉ được gắn khi metadata
  provider của cùng tài khoản xác nhận Message-ID và chủ đề khớp. Luồng OAuth mới
  yêu cầu Gmail readonly và send. Các grant modify cũ vẫn được nhận diện khi gửi.
  [Gmail gửi MIME và gắn thread](https://developers.google.com/workspace/gmail/api/guides/sending)
  [Scope được chấp nhận](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- Khi kết quả Gmail chưa rõ, kiểm tra lại bằng cùng mã chỉ đọc Sent. Kết quả phải
  là một thư duy nhất, còn nhãn SENT và khớp chính xác RFC Message-ID trong metadata.
  Tìm không thấy, thấy nhiều thư hoặc lỗi đọc giữ trạng thái chưa rõ. Có cooldown
  15 giây theo yêu cầu để hạn chế đọc lặp. [Gmail tìm theo RFC Message-ID](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- SMTP dùng thông tin từ vault, TLS và Message-ID đã gán. Máy chủ có thể chấp nhận
  một phần người nhận. Trạng thái partial được lưu và trả về khi kiểm tra lại.
  SMTP mất kết nối sau DATA giữ trạng thái chưa rõ. SMTP không có bằng chứng
  Sent chuẩn từ adapter hiện tại, nên việc xác nhận các ca này cần đối chiếu tại máy chủ gửi.
- Giao dịch xác nhận lưu biên nhận và dòng Sent cùng lúc. Gmail dùng cùng định danh
  với sync để hội tụ về một dòng. Dòng SMTP do app tạo không có UID nguồn và được
  giữ qua quét IMAP. Xác nhận muộn không đổi được kết quả đã kết thúc.
- Compose giữ mã và dấu vân tay của bản soạn trong bộ nhớ và sessionStorage của
  tab. Lỗi mạng cho phép thử lại cùng yêu cầu. Phản hồi chưa rõ hiển thị nút kiểm
  tra trạng thái. Sau từ chối dứt khoát, người dùng có thể gửi lại bằng mã mới.
  Dấu vân tay khớp cho phép tiếp tục sau khi mở lại đúng bản soạn trong cùng tab.

## Kiểm thử đã chạy

macOS arm64, Node 24.14.1, npm 11.11.0, PostgreSQL 16.14 và Next.js 16.4.6.
Còn 46 GiB trước build. Build dùng biến môi trường giả lập và cổng Supabase loopback.
Không thêm dependency.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run test:unit` | Exit 0, 81/81 gồm compose retry qua remount | [Log](evidence/m1c-unit.log) |
| `npm run test:integration` | Exit 0, 168/168 gồm MIME, lỗi Gmail/SMTP và tenant routes | [Log](evidence/m1c-integration.log) |
| `npm run test:db` | Exit 0, 13 migration và kiểm tra quyền RPC, conflict, rollback, hợp nhất Sent | [Log](evidence/m1c-db.log) |
| `npm run test:local-auth` | Exit 0, 82/82 gồm 21 ca gửi và 61 ca hồi quy | [Log](evidence/m1c-local-auth.log), [JSON](evidence/m1c-local-auth.json) |
| `npm run typecheck` | Exit 0 sau khi sửa tham số truy vấn trong test compose | [Log](evidence/m1c-typecheck.log) |
| `npm run build` | Exit 0 sau cùng bản sửa typecheck, compile và prerender hoàn tất | [Log](evidence/m1c-build.log) |
| `npm run lint` | Exit 0, 97 cảnh báo và 0 lỗi | [Log](evidence/m1c-lint.log) |
| `npm audit --audit-level=high` | Exit 0, 11 moderate | [Log](evidence/m1c-audit.log) |

Native rehearsal dùng Next, GoTrue, PostgREST và PostgreSQL thật trên local. Gmail
là fixture HTTP loopback được chặn khỏi kết nối provider. SMTP gửi qua Nodemailer
với TLS tới máy chủ giả lập, có xác thực bằng vault và từ chối từng người nhận.
Các ca chính kiểm tra hai request cùng mã, mất phản hồi Gmail sau khi nhận MIME,
tìm Sent chưa có chỉ mục, khôi phục từ Sent, SMTP mất kết nối sau DATA, tiến trình
bỏ dở, mất xác nhận ghi database và không truy cập chéo tenant. Bộ test browser dùng
jsdom, và ca mất xác nhận database chèn lỗi ở client sau commit thật.

## Giới hạn và vận hành

Bằng chứng xác nhận provider đã chấp nhận yêu cầu hoặc Gmail có bản ghi Sent.
Việc thư đến hộp thư người nhận cần bằng chứng riêng. Các kiểm tra dùng Gmail
giả lập và SMTP TLS local. Khả năng tương tác provider thật, OAuth verification,
định tuyến SMTP tùy chỉnh và kiểm thử triển khai hosted còn trong security gate.

Bảo đảm chống gửi lặp có phạm vi một mã trong vòng đời tài khoản. Tab khác hoặc
nội dung mới có thể tạo một yêu cầu gửi khác. Sau khi ứng dụng xác nhận từ chối,
lần bấm Gửi tiếp theo là một yêu cầu mới. Trạng thái SMTP partial hiện báo mức
chấp nhận một phần, chưa hiển thị danh sách người nhận bị từ chối trong Compose.
Mã cũ vẫn cho truy xuất kết quả. Browser cũ gọi API thiếu mã cần tải lại Compose.

Bản chụp nội dung gửi được giữ trong bảng riêng khi kết quả chưa rõ để có thể
ghi lại Sent sau xác minh. Khi kết thúc, bản chụp được xóa và biên nhận được giữ.
Chưa có TTL tự động cho trạng thái chưa rõ. Xóa tài khoản cascade sổ gửi.

Khi chuyển phiên bản, migration và ứng dụng cần đi cùng nhau. Nếu phải dừng,
đóng đường gửi và giữ sổ biên nhận để đối chiếu. Bản gửi cũ bỏ qua sổ biên nhận
nên không dùng để xử lý các yêu cầu đã bắt đầu. Trạng thái chưa rõ cần kiểm tra
bằng cùng mã và bằng chứng nhà cung cấp trước khi quyết định tạo một yêu cầu mới.

Đã dọn PostgreSQL tạm, 5 container và 2 network của fixture, hai listener loopback
và thư mục chứng chỉ `.codex-smtp-test-*`. Docker image prune thu hồi 0 B. Build
dùng `.next`. Working checkout là nơi duy nhất chứa mã và bằng chứng.

Milestone kế tiếp là M2-A Design System.
