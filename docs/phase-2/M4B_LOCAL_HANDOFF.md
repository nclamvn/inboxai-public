# M4-B Ask Inbox trả lời theo nguồn

Baseline `fd47f98`, nhánh `phase2/m0-security-baseline-20261111`.
Triển khai và kiểm thử local bằng thư giả lập.
Đơn vị review `5e35fc5` gồm truy xuất nguồn và tổng hợp,
`d69d14d` gồm giao diện và kiểm thử trình duyệt.

## Cách dùng

Mở **Ask Inbox** tại `/search`. Nhập một câu hỏi có mã hồ sơ, ví dụ
“Hạn thanh toán, tổng tiền hóa đơn và số tiền đã thanh toán của INV-6422?”
Chọn **Hỏi email**. Bộ lọc tài khoản, người gửi, ngày và tệp đính kèm dùng
cùng phạm vi với **Tìm thư**. Khoảng ngày tính theo UTC+7.

Mỗi mục hiển thị giá trị từ các thư, trích đoạn nguyên văn, người gửi, hộp
thư, ngày nhận và liên kết nguồn. Các giá trị tương đương được gộp kèm
nguồn riêng. Khi giá trị lệch nhau, Ask Inbox giữ các giá trị và bằng
chứng tương ứng, đồng thời báo chưa xác định được giá trị áp dụng. Mục
thiếu dữ liệu hoặc có định dạng chưa rõ hiển thị trạng thái riêng.
Nguồn chưa rõ được trích để người dùng kiểm tra. Back trở lại câu hỏi.

Khi mở nguồn, hệ thống kiểm tra lại quyền truy cập và phiên bản nội dung.
Nếu email đổi hoặc không còn khả dụng, trang nguồn yêu cầu đối chiếu lại.
Màn kết quả hiện theo snapshot tại thời điểm hỏi. Kiểm tra phiên bản chạy
tại thời điểm mở liên kết.

## Phạm vi nhận diện

- Một mã hồ sơ dạng chữ và số có dấu gạch nối, ví dụ `PO-771` hay `INV-6422`.
  Mã phải xuất hiện trong tiêu đề hoặc thân thư văn bản. Với thư nhiều mã,
  chỉ câu ghi đúng mã được dùng để đối chiếu. Nếu doanh nghiệp dùng lại mã
  cho các hồ sơ khác nhau, cần thu hẹp theo hộp thư, người gửi hoặc ngày.
- Hỗ trợ ngày phát hành hóa đơn, hạn thanh toán, ngày đã thanh toán, ngày
  giao hàng, tổng tiền hóa đơn, số tiền còn phải trả và số tiền đã thanh toán.
  Các nhóm giá trị giữ riêng. Ngày nhận email dùng để sắp thứ tự nguồn,
  không dùng làm ngày nghiệp vụ.
- Ngày đầy đủ được chuẩn hóa về ISO, gồm ngày ISO, ngày số và một số dạng
  tháng viết bằng chữ tiếng Việt hoặc tiếng Anh. Ngày tương đối và ngày số
  tiếng Anh có hai cách hiểu được giữ ở trạng thái chưa rõ.
- Tiền VND, USD và EUR cần đơn vị rõ ràng. Giá trị so sánh dùng số nguyên
  đơn vị nhỏ nhất dưới dạng chuỗi. Dấu `$` đứng riêng, giá ước tính hoặc
  khoảng tiền không được suy diễn. Chưa có quy đổi tiền, tính tổng nhiều
  khoản, ghép giao dịch, phân xử thư sửa đổi theo thẩm quyền hoặc xác nhận
  tiền thực sự đã đến tài khoản.
- Bộ tổng hợp dùng quy tắc cục bộ cho phát biểu có nhãn rõ ràng. Luồng trả
  lời không gọi model sinh văn bản. Các dấu trích dẫn, chuyển tiếp và
  điều kiện quen thuộc được bỏ qua hoặc giữ ở trạng thái chưa rõ. Chưa
  hỗ trợ câu hỏi mở, tài liệu đính kèm, chữ trong ảnh hoặc HTML.

## Biên dữ liệu và rollback

API trả lời đọc tối đa 24 email khớp mã sau bộ lọc, với tối đa 500 ký tự
tiêu đề và 24.000 ký tự thân thư mỗi nguồn. Hàm đọc dùng lại chỉ mục từ
khóa, quyền và bộ lọc M4-A. Phát hiện vượt số email hoặc nội dung bị cắt
sẽ giới hạn kết luận ở phần đã kiểm tra. Tối đa sáu giá trị và ba nguồn
mỗi giá trị được hiển thị. Số giá trị còn lại được báo trong kết quả.

Nguồn gắn UUID và SHA-256 của snapshot nội dung. Hàm kiểm phiên bản từ
trang nguồn lấy người dùng từ phiên xác thực và loại thư đã xóa. API
không nhận danh sách bằng chứng từ client. Hai RPC đọc có quyền
`authenticated`; không tạo bản ghi hay gửi email. Có thể quay về bản
ứng dụng trước M4-B và giữ các hàm bổ sung.
[Migration M4-B](../../supabase/migrations/20261111100000_ask_inbox_answers.sql),
[PostgreSQL text search](https://www.postgresql.org/docs/16/textsearch-controls.html),
[PostgreSQL SHA-256](https://www.postgresql.org/docs/16/functions-binarystring.html)

## So sánh trên fixture

Năm câu hỏi giả lập khác bộ unit test được chạy qua Next, Auth,
PostgREST và PostgreSQL local. Đối chứng dùng cùng mã trích xuất, câu hỏi
và phạm vi nhưng chỉ nhận email mới nhất của mỗi hồ sơ. Nhánh M4-B dùng
toàn bộ email đã đọc trong phạm vi. Trong ca dữ liệu bổ sung, email mới
nhất thiếu hạn thanh toán. Trong ca mâu thuẫn, email mới nhất cho một giá
trị trong khi đọc cả hai phát hiện cả hạn và tiền không thống nhất. Ba
ca còn lại đều dừng khi thiếu bằng chứng. Chưa chạy đối chứng LLM hoặc
agent và chưa đo trên hộp thư thật.
[So sánh từng câu và thời gian HTTP](evidence/m4b/synthesis.json)

## Kiểm chứng local

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6,
PostgreSQL 16, Chromium 157.0.8103.51. Fixture dùng Auth, PostgREST
và PostgreSQL local, tài khoản `.test`, SMTP nhận nội bộ và chặn fetch
ngoài loopback.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run test:unit` | Exit 0, 174/174 | [Log](evidence/m4b-unit.log) |
| `npm run test:integration` | Exit 0, 171/171 | [Log](evidence/m4b-integration.log) |
| `npm run test:db` | Exit 0, 19 migration, gồm cách ly tenant, khớp mã nguyên vẹn, giới hạn nguồn và phiên bản | [Log](evidence/m4b-db.log) |
| `npm run test:ask-answer` | Exit 0, 25 ca Auth, API và trình duyệt | [Log](evidence/m4b-browser.log), [JSON](evidence/m4b-browser-run.json) |
| `npm run test:ask-inbox` | Exit 0, 25 ca hồi quy M4-A với E5 local | [Log](evidence/m4b-m4a-regression.log), [JSON](evidence/m4b-m4a-regression.json) |
| `npm run lint` | Exit 0, 91 cảnh báo, 0 lỗi | [Log](evidence/m4b-lint.log) |
| `npm run typecheck` | Exit 0 sau build | [Log](evidence/m4b-typecheck.log) |
| `npm run build` | Exit 0, có route trả lời và kiểm tra nguồn. Còn cảnh báo import Sentry lỗi thời | [Log](evidence/m4b-build.log) |

Chromium ghi 0 lỗi runtime hoặc hydration trong lượt cuối. Axe ghi 0 vi
phạm trong bốn trạng thái đã mở, gồm nguồn đã thay đổi. Kích thước desktop,
tablet và mobile được mô phỏng. Chưa chạy Safari, Firefox, WebView,
thiết bị thật hoặc trình đọc màn hình.
[Desktop đủ nguồn](evidence/m4b/desktop.png),
[tablet thiếu dữ liệu](evidence/m4b/tablet.png),
[mobile có mâu thuẫn](evidence/m4b/mobile.png),
[nguồn đã thay đổi](evidence/m4b/stale-source.png),
[JSON kiểm thử giao diện](evidence/m4b/browser.json)

Build dùng lại `.next` với cấu hình giả lập, 37 GiB trống trước khi chạy.
Đã dừng các tiến trình kiểm thử và dọn tài nguyên Docker, cơ sở dữ liệu
PostgreSQL tạm và chứng chỉ tạm của fixture. `docker image prune -f`
báo thu hồi 0 B.
