# M3-C Phát hiện cam kết từ email

Ngày 11/11/2026. Baseline `8c55c26`, nhánh
`phase2/m0-security-baseline-20261111`. Môi trường local với dữ liệu giả lập.
Các đơn vị review gồm `52053a7` cho nhận diện, API và biên ghi,
cùng `e27935b` cho giao diện và bài diễn tập trình duyệt.

## Luồng sử dụng

Mở **Cam kết**, chọn **Đề xuất từ email**. Màn Cam kết tự kiểm tra trang
email mới nhất khi mở và kiểm tra lại mỗi 60 giây khi tab đang hoạt động
và danh sách còn một trang. **Kiểm tra thêm email** đọc từng trang cũ hơn.
Mỗi lần đọc tối đa 24 thư chưa xóa, theo thứ tự thư vào cơ sở dữ liệu.

Mỗi đề xuất hiển thị loại thay đổi, trích đoạn nguyên văn, người gửi, thời
điểm và liên kết vào đúng thư nguồn. **Xem và xác nhận** hiển thị các trường
của cam kết mới hoặc so sánh giá trị trước và sau đối với cam kết hiện có.
Chỉ **Xác nhận và ghi vào sổ** tạo cam kết hoặc bổ sung phiên bản vào lịch sử.
Đề xuất sẵn sàng xác nhận đứng đầu danh sách. Bản đã lưu có thể chỉnh từ
màn chi tiết của sổ.

## Phạm vi nhận diện

- Quy tắc cục bộ nhận diện một phát biểu rõ trong thân thư văn bản tiếng Việt
  hoặc tiếng Anh. Phạm vi gồm lời hứa của người gửi, đổi ngày đến hạn,
  chuyển trách nhiệm sang một địa chỉ email được nêu rõ, hoàn tất và hủy.
  Các ví dụ khả dụng gồm `Chúng tôi sẽ gửi biên bản trước ngày 19/11/2026.`
  và `We have moved the deadline to 2026-11-20.`
- Hạn lịch cần ngày cụ thể dạng `YYYY-MM-DD` hoặc `D/M/YYYY`. Lời hứa
  có hạn tương đối giữ hạn ở trạng thái chưa rõ. Phát biểu có điều kiện,
  nhiều tín hiệu trong một thư, nội dung trích dẫn hoặc chuyển tiếp có dấu
  phân cách quen thuộc được bỏ qua. Bộ nhận diện bỏ qua thân thư quá 8.000
  ký tự và trích đoạn quá 480 ký tự.
- Ghép cập nhật theo một mã xuất hiện rõ ở tiêu đề, ví dụ `PO-731`, kết hợp
  với cùng hộp thư và địa chỉ người gửi. Một khóa tương ứng với một nghĩa
  vụ. Cam kết mới thiếu mã được định danh bằng email nguồn. Cập nhật thiếu
  liên kết ổn định hoặc chưa xác minh được thứ tự thời gian hiện kèm nguồn
  để kiểm tra, với trạng thái chưa sẵn sàng xác nhận. Cam kết tạo thủ công
  trước M3-C có khóa khác và cần chỉnh qua luồng M3-B.
- Không có lời gọi model, OCR hoặc provider ngoài trong đường phát hiện.
  Tập giả lập kiểm tra quy tắc và luồng ghi. Chưa đo precision, recall,
  thời gian tiết kiệm hay chi phí trên thư thực tế, và chưa chạy đối chứng
  LLM trực tiếp hoặc agent. Việc quét phụ thuộc màn Cam kết đang hoạt động.

## Biên ghi và nguồn

[Migration M3-C](../../supabase/migrations/20261111080000_commitment_detection.sql)
cấp các RPC xác thực bằng `auth.uid()`. Quét chỉ đọc và API chỉ trả đề
xuất đã lọc. Khi người dùng xác nhận, RPC kiểm lại quyền sở hữu thư,
trạng thái xóa, dấu vân tay của dữ liệu phân tích và việc nguồn đã được ghi
nhận. RPC tái sử dụng `save_commitment` để kiểm tra trích đoạn, khóa phiên
bản, lưu lịch sử và xử lý biên nhận cùng giao dịch. Khi mất phản hồi, lần
thử lại giữ nguyên mã yêu cầu và nội dung đã xem. Cập nhật chỉ tự ghép khi
nguồn mới hơn tất cả bằng chứng lịch sử còn xác định được thời điểm.

Tắt đường đề xuất bằng cách quay về phiên bản ứng dụng trước M3-C. Migration
bổ sung chỉ tạo chỉ mục và hàm. Cam kết người dùng đã xác nhận vẫn dùng
cấu trúc ledger của M3-A.

## Kiểm chứng local

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6,
PostgreSQL 16 và Chromium 157.0.8103.51. Bài diễn tập dùng Next.js, GoTrue,
PostgREST và PostgreSQL chạy local, tài khoản `.test` và SMTP nhận thử
trong mạng fixture. Trình duyệt chặn địa chỉ ngoài loopback.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run test:unit` | Exit 0, 125/125, gồm 25 ca nhận diện | [Log](evidence/m3c-unit.log) |
| `npm run test:integration` | Exit 0, 168/168 | [Log](evidence/m3c-integration.log) |
| `npm run test:db` | Exit 0, 17 migration, gồm kiểm tra phân trang, hai tenant, nguồn cũ và biên nhận | [Log](evidence/m3c-db.log) |
| `npm run lint` | Exit 0, 91 cảnh báo, 0 lỗi | [Log](evidence/m3c-lint.log) |
| `npm run typecheck` | Exit 0 sau build | [Log](evidence/m3c-typecheck.log) |
| `npm run test:commitment-detection` | Exit 0, 28 ca gồm 14 ca nền Auth/RLS và 14 ca phát hiện, xác nhận, trình duyệt | [Log](evidence/m3c-browser.log), [JSON](evidence/m3c-browser-run.json) |
| `npm run test:commitment-ui` | Exit 0, 23 ca hồi quy M3-B | [Log](evidence/m3c-m3b-regression.log), [JSON](evidence/m3c-m3b-regression.json) |
| `npm run build` | Exit 0, có route `/api/commitments/detections`. Cảnh báo import cấu hình Sentry đã lỗi thời còn hiện. | [Log](evidence/m3c-build.log) |

Ảnh chụp của fixture [Danh sách desktop](evidence/m3c/desktop-proposals.png),
[xem trước desktop](evidence/m3c/desktop-preview.png),
[danh sách tablet](evidence/m3c/tablet-proposals.png) và
[xem trước mobile](evidence/m3c/mobile-preview.png).
Trong bốn trạng thái đã lấy mẫu, axe ghi 0 vi phạm. Chromium ghi 0 lỗi
runtime hoặc hydration đã thu thập. Lượt chạy chứng minh bản xem trước
không ghi, mở được email nguồn, lần duyệt thứ hai đồng thời bị chặn,
bản xem trước lỗi thời không ghi đè và thử lại sau khi mất phản hồi giữ
cùng mã yêu cầu. [Bằng chứng trình duyệt](evidence/m3c/browser.json)

Các kích thước được mô phỏng trong Chromium. Chưa kiểm Safari, Firefox,
WebView, thiết bị thật hoặc trình đọc màn hình.

Đã dừng các tiến trình local, xóa tài nguyên Docker thuộc fixture, thư mục
PostgreSQL và chứng chỉ tạm. `docker image prune -f` báo thu hồi 0 B.
Build dùng lại `.next` với cấu hình giả lập và 40 GiB trống trước khi chạy.
