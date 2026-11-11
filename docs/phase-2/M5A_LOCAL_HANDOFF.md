# M5-A AI Operator

Ngày 12/11/2026. Baseline `4929da7`, nhánh
`phase2/m0-security-baseline-20261111`. Triển khai và kiểm thử local
bằng tài khoản và email giả lập.
Hai đơn vị review local là `75a3e8e` cho biên ghi và `fedab20`
cho giao diện cùng bài diễn tập trình duyệt.

## Luồng sử dụng

Mở **AI Operator** tại `/operator`. Desktop mở từ thanh bên. Mobile
mở từ Ask Inbox. Chọn tài khoản rồi nhập một lệnh, ví dụ:

- `Lưu trữ thư cũ hơn 30 ngày, trừ thư có tệp đính kèm`
- `Đánh dấu đã đọc thư từ vendor@example.test`
- `Lưu trữ thư trước ngày 2026-11-01`

**Xem trước kế hoạch** lưu danh sách thư khớp tại thời điểm lập. Màn
hiển thị tài khoản, điều kiện, ngày hết hạn, thay đổi dự kiến và từng
email nguồn. Có thể bỏ chọn thư. **Xem lại phạm vi đã chọn** mở hộp thoại
liệt kê các thư sẽ được duyệt. **Phê duyệt phạm vi này** khóa các ID đã
chọn. **Thực thi** là bước riêng, xuất hiện sau khi phê duyệt thành công.
Nhật ký trong chi tiết có số thư và thời điểm của từng bước.

Bản này hỗ trợ lưu trữ và đánh dấu đã đọc cho thư đến đang nằm trong hộp
thư InboxAI. Bộ phân tích lệnh chạy cục bộ với mẫu tiếng Việt và tiếng
Anh. Một lệnh cần đúng một điều kiện gồm số ngày, ngày cụ thể hoặc địa
chỉ gửi chính xác. Tuổi thư tính theo khoảng 24 giờ. Ngày cụ thể dùng
mốc 00:00 UTC+7. Có thể giữ thư có đính kèm. Nếu vượt 40 thư, người
dùng phải thu hẹp trước khi lập kế hoạch. Kế hoạch hết hạn sau 15 phút.

## Phạm vi, giao dịch và nhật ký

[Migration M5-A](../../supabase/migrations/20261112000000_operator_plans.sql)
đặt kế hoạch và sự kiện trong schema private. RPC dùng `auth.uid()`.
Dấu vân tay nguồn bao gồm nội dung văn bản, metadata liên quan và trạng
thái cần cho hành động. Nội dung thư không được đưa vào bộ phân tích lệnh.
Preview lưu ID và hash, không sao chép thân thư, tiêu đề hoặc lệnh gốc vào
nhật ký. Danh sách chi tiết đọc metadata hiện tại của thư còn thuộc người dùng.

- **Plan** dùng khóa yêu cầu. Yêu cầu lặp cùng nội dung trả lại kế hoạch
  cũ. Dùng cùng khóa với điều kiện hoặc hành động khác bị từ chối.
- **Approve** kiểm hash bản xem trước và chỉ nhận tập con ID trong danh
  sách đó. Sau phê duyệt, hash mới khóa hành động và phạm vi. Một lần
  phê duyệt lặp cùng tập ID trả lại trạng thái hiện có.
- **Execute** chỉ nhận ID kế hoạch và hash phê duyệt. PostgreSQL khóa kế
  hoạch và các email đã chọn, kiểm tra lại dấu vân tay, quyền, trạng thái
  và hạn. Nếu một thư không còn khớp, cả lô dừng. Thư đến sau bản xem
  trước nằm ngoài phạm vi đã duyệt. Cập nhật cờ, kiểm tra số dòng và trạng
  thái cuối, ghi sự kiện và biên nhận trong một giao dịch.
- Nhật ký theo dõi đã lập kế hoạch, đã duyệt, đã thực thi, phạm vi thay
  đổi hoặc hết hạn khi phát hiện trong thao tác ghi. Trạng thái hết hạn
  cũng được tính khi đọc. Chi tiết giữ hash phạm vi và số lượng của mỗi
  sự kiện. Màn danh sách hiện 20 kế hoạch gần nhất.

Sau khi giao dịch đã commit, yêu cầu thực thi lặp hoặc đồng thời trả lại
cùng biên nhận. Kiểm thử có ca mất phản hồi sau commit và ca khôi phục
cờ bằng thao tác riêng trước khi gửi lại yêu cầu cũ.
[Khóa dòng PostgreSQL](https://www.postgresql.org/docs/16/explicit-locking.html),
[Read Committed](https://www.postgresql.org/docs/16/transaction-iso.html)

Thực thi cập nhật cờ trong cơ sở dữ liệu InboxAI. Gửi thư, xóa thư,
thay đổi trực tiếp tại Gmail/IMAP và hoàn tác theo kế hoạch nằm ngoài
phạm vi lần này. Chưa chạy đối chứng LLM hoặc agent. Có thể quay về
phiên bản ứng dụng trước và giữ các bảng cùng nhật ký bổ sung.

## Kiểm chứng local

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6,
PostgreSQL 16 và Chromium 157.0.8103.51. Fixture chạy Auth,
PostgREST và PostgreSQL local với thư `.test` và SMTP nhận nội bộ.
Trình duyệt chỉ truy cập loopback.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run test:unit` | Exit 0, 187/187 | [Log](evidence/m5a-unit.log) |
| `npm run test:integration` | Exit 0, 171/171 | [Log](evidence/m5a-integration.log) |
| `npm run test:db` | Exit 0, 20 migration, gồm phạm vi, hết hạn, cách ly, chống lặp và không ghi lô cũ | [Log](evidence/m5a-db.log) |
| `npm run test:operator` | Exit 0, 24 ca Auth, API và trình duyệt | [Log](evidence/m5a-browser.log), [JSON](evidence/m5a-browser-run.json) |
| `npm run test:ask-answer` | Exit 0, 25 ca hồi quy M4-B | [Log](evidence/m5a-m4b-regression.log), [JSON](evidence/m5a-m4b-regression.json) |
| `npm run test:design` | Exit 0, 25 ca hồi quy Inbox | [Log](evidence/m5a-design-regression.log), [JSON](evidence/m5a-design-regression.json) |
| `npm run lint` | Exit 0, 91 cảnh báo, 0 lỗi | [Log](evidence/m5a-lint.log) |
| `npm run typecheck` | Exit 0 sau build | [Log](evidence/m5a-typecheck.log) |
| `npm run build` | Exit 0, có `/operator` và API. Còn cảnh báo import Sentry lỗi thời | [Log](evidence/m5a-build.log) |

Axe ghi 0 vi phạm trong năm trạng thái đã mở. Chromium không ghi lỗi
runtime hoặc hydration trong lượt Operator cuối. Các viewport desktop,
tablet và mobile được mô phỏng. Chưa kiểm Safari, Firefox, WebView,
thiết bị thật hoặc trình đọc màn hình.
[Bản xem trước](evidence/m5a/desktop-preview.png),
[phê duyệt desktop](evidence/m5a/desktop-approval.png),
[biên nhận](evidence/m5a/desktop-receipt.png),
[tablet phát hiện thay đổi](evidence/m5a/tablet-stale.png),
[phê duyệt mobile](evidence/m5a/mobile-approval.png),
[JSON kiểm thử](evidence/m5a/browser.json)

Kiểm thử hồi quy Ask Inbox chờ trang nguồn tải xong trước khi chụp và
giữ nguyên caret để Playwright không sửa style nội tuyến trong lúc
React khởi tạo. Kiểm tra lỗi hydration vẫn được chạy.

Build dùng lại `.next`, với 36 GiB trống trước khi chạy và cấu hình
giả lập. Đã dừng tiến trình kiểm thử, dọn tài nguyên Docker của fixture,
PostgreSQL tạm và chứng chỉ tạm. `docker image prune -f` thu hồi 0 B.
