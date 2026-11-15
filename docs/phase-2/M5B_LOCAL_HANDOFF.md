# M5-B AI Operator

Ngày 12/11/2026. Baseline `6e2d3d2`, nhánh
`phase2/m0-security-baseline-20261111`. Hai commit triển khai local là `a81d021`
cho PostgreSQL/API và `9d28cc9` cho giao diện cùng diễn tập trình duyệt.

## Luồng sử dụng

1. Mở **AI Operator** tại `/operator`, lập kế hoạch, phê duyệt phạm vi rồi thực thi.
2. Xem **Xác minh và hoàn tác** trong chi tiết kế hoạch. Lần xác minh tự động đọc
   lại cờ trong PostgreSQL sau cập nhật. **Xác minh lại** ghi số thư khớp, đã thay
   đổi hoặc không còn khả dụng tại lần kiểm tra mới.
3. Với thao tác lưu trữ hoặc đánh dấu đã đọc, chọn **Xem trước hoàn tác** để xem
   các thư đã duyệt và trạng thái gốc của từng thư. Chọn **Hoàn tác phạm vi này**
   để khôi phục cả lô. Nếu có thư thay đổi hoặc mất quyền truy cập, toàn bộ lô dừng.
4. Nhật ký hiển thị thời điểm, số thư khớp và nguyên nhân chặn theo nhóm kết quả.
   Biên nhận hoàn tác xác nhận đã đọc lại trạng thái gốc. Chi tiết giữ lịch sử đã
   thực thi và trình bày kết quả hoàn tác riêng. Mỗi lần đọc hiển thị tối đa 20
   sự kiện kết quả gần nhất.

## Phạm vi và giao dịch

[Migration M5-B](../../supabase/migrations/20261112010000_operator_outcomes.sql)
giữ RPC M5-A tương thích. Khi thực thi, RPC khóa kế hoạch và các email đã được
duyệt, lưu cờ gốc gồm cả `false` và `NULL`, rồi kiểm tra cờ vừa ghi. Thao tác,
snapshot và nhật ký xác minh đầu tiên commit cùng giao dịch. Việc thực thi lặp
trả biên nhận cũ. Một lần xác minh thủ công chỉ quan sát trạng thái tại thời
điểm truy vấn và ghi nhật ký, không cập nhật thư.

Hoàn tác chỉ dùng ID và hash phạm vi kế hoạch đã duyệt. RPC kiểm tra tenant,
quyền xem thư, dấu vân tay nguồn và revision của cờ/trạng thái liên quan dưới
khóa dòng. Cờ đổi rồi đổi lại vẫn mang revision mới. Cập nhật cùng giá trị giữ
revision cũ. Một thay đổi sang trạng thái đã đọc hoặc lưu trữ khác sau thực thi
cũng có thể chặn hoàn tác để tránh ghi đè thay đổi mới. Hoàn tác toàn bộ phạm vi
đã duyệt, không có lựa chọn hoàn tác từng phần hay thời hạn riêng. Khi thành công,
cờ gốc, kết quả đọc lại và biên nhận được ghi cùng giao dịch. Khi phát hiện thay
đổi sau bản xem trước, RPC chỉ ghi sự kiện chặn. Yêu cầu lặp sau khi mất phản hồi
dùng cùng khóa. Các yêu cầu đồng thời dùng khóa khác nhau vẫn nhận cùng biên
nhận thành công.

Kế hoạch thực thi trước migration có thể xác minh cờ hiện tại. Snapshot gốc của
các kế hoạch này không tồn tại nên không thể hoàn tác. Hai thao tác M5-B áp dụng
cho trạng thái trong cơ sở dữ liệu InboxAI. Kiểm chứng Gmail/IMAP, thiết bị native
và CI từ xa chưa chạy. Luồng dùng bộ phân tích lệnh xác định của M5-A. Chưa đo chất
lượng, thời gian hoặc chi phí so với LLM trực tiếp hay agent có công cụ.

Có thể quay về ứng dụng M5-A trong khi giữ migration và dữ liệu audit. Hai RPC
thực thi và đọc chi tiết cũ vẫn tồn tại cùng chữ ký. Tránh xóa bảng audit hoặc
sửa migration đã áp dụng khi xử lý lỗi.

## Kiểm chứng local

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6,
PostgreSQL 16 và Chromium 157.0.8103.51. Fixture trình duyệt dùng Auth, PostgREST
và PostgreSQL local cùng tài khoản và email `example.test`. Build dùng cấu hình
giả lập và URL Supabase loopback.

| Lệnh | Kết quả quan sát | Log |
| --- | --- | --- |
| `npm run lint` | Exit 0, 0 lỗi, 91 cảnh báo baseline | [Lint](evidence/m5b-lint.log) |
| `npm run typecheck` | Exit 0 | [TypeScript](evidence/m5b-typecheck.log) |
| `npm run test:unit` | Exit 0, 187/187 | [Unit](evidence/m5b-unit.log) |
| `npm run test:integration` | Exit 0, 171/171, có mock ở biên | [Integration](evidence/m5b-integration.log) |
| `npm run test:db` | Exit 0, fresh và upgrade. Kiểm tra hai tenant, email biến mất, đổi cờ rồi đổi lại, rollback khi ghi audit thất bại và replay | [SQL](evidence/m5b-db.log) |
| `npm run test:operator-outcomes` | Exit 0, 22 ca gồm 14 Auth và 8 M5-B | [Browser](evidence/m5b-browser.log) · [Kết quả](evidence/m5b-browser-run.json) |
| `npm run test:operator` | Exit 0, 24 ca hồi quy M5-A, gồm các ca Auth dùng chung | [Hồi quy](evidence/m5b-m5a-regression.log) |
| `npm run build` | Exit 0, sinh 89 trang tĩnh. Còn cảnh báo deprecation của Sentry | [Build](evidence/m5b-build.log) |

Các ca trình duyệt bao gồm mất phản hồi sau commit, hai yêu cầu hoàn tác đồng
thời, chặn sửa một phần khi thư đổi sau xem trước và tải lại trên mobile. Bốn
trạng thái chụp không có vi phạm axe trong bộ quy tắc đã chạy, không tràn ngang
và không ghi nhận lỗi runtime. Đây là kiểm tra trên viewport mô phỏng.
[Kết quả axe](evidence/m5b/browser.json)

- [Desktop xem trước hoàn tác](evidence/m5b/desktop-undo-preview.png)
- [Desktop biên nhận hoàn tác](evidence/m5b/desktop-undo-receipt.png)
- [Tablet chặn hoàn tác do thư thay đổi](evidence/m5b/tablet-drift.png)
- [Mobile biên nhận sau tải lại](evidence/m5b/mobile-undone.png)

Trước build còn 36 GiB trống. Fixture tự dọn tài nguyên tạm do bài test tạo.
`docker image prune -f` thu hồi 0 B. Dùng `.next` có sẵn, không tạo bản sao dự án,
thư mục build riêng hoặc môi trường tạm bên ngoài repo. Không push, deploy,
kết nối hộp thư thật hoặc gửi email thật.
