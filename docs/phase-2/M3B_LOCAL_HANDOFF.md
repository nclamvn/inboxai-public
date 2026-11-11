# M3-B Giao diện cam kết

Ngày 11/11/2026. Baseline `c869f11`, nhánh
`phase2/m0-security-baseline-20261111`. Triển khai và kiểm thử trong checkout
local với email và tài khoản giả lập.

Các đơn vị review local gồm `f8f9f82` cho nhóm cam kết và API,
`55a0253` cho giao diện và sửa khởi tạo theme, cùng `db6d9d0`
cho kiểm thử Chromium.

## Luồng người dùng

- **Cam kết** mở từ thanh điều hướng desktop hoặc mobile. Ba nhóm chính là
  **Tôi phải làm**, **Đang chờ** và **Quá hạn**. Mục **Chưa rõ** dành cho
  cam kết đang mở chưa có email người phụ trách. **Đã khép** gồm cam kết đã
  hoàn tất hoặc hủy.
- Người phụ trách được nhận diện qua email đăng nhập và địa chỉ thư thuộc
  người dùng, so khớp không phân biệt chữ hoa. Cam kết đang mở đã quá hạn
  nằm trong nhóm Quá hạn và vẫn hiển thị người phụ trách. Ngày lịch chuyển
  sang quá hạn vào nửa đêm theo UTC+7. Hạn có giờ so với thời điểm thực.
- Desktop hiển thị danh sách cạnh chi tiết. Tablet và mobile mở riêng
  chi tiết, giữ nhóm khi quay lại. URL lưu nhóm và UUID cam kết để có thể
  mở trực tiếp hoặc quay lại từ email nguồn bằng lịch sử trình duyệt.
- Lịch sử hiển thị từng phiên bản, trường đổi và email nguồn. Khi trích đoạn
  đã thay đổi, giao diện chỉ mở email hiện có và báo nội dung đã thay đổi.
  Nguồn không còn khả dụng được ghi rõ trong lịch sử.
- **Xác nhận thay đổi** mở form chỉnh cam kết, hạn, người phụ trách và
  trạng thái. Người dùng chọn từ một đến ba trích đoạn đã kiểm chứng
  hoặc gắn thêm một nguồn bằng liên kết Inbox/UUID và đoạn nguyên văn.
  Màn xem trước trình bày giá trị cũ, giá trị mới và email dùng làm bằng
  chứng. Chỉ nút **Xác nhận và lưu** ghi phiên bản mới.

## Hợp đồng và quyết định triển khai

[Migration phân nhóm](../../supabase/migrations/20261111070000_commitment_board.sql)
bổ sung RPC đọc theo người dùng từ phiên đăng nhập. `GET /api/commitments?group=...`
trả nhóm đã lọc, số lượng trên toàn bộ sổ và cursor. Các trang sắp theo
thời điểm tạo và UUID ổn định. Các giá trị nhóm là `mine`, `waiting`,
`overdue`, `unassigned` và `closed`.

UI dùng các API đọc chi tiết và ghi phiên bản từ M3-A. Khi API báo xung
đột, màn xem trước chặn lưu tiếp và cho tải bản hiện hành. Khi mất phản
hồi, nút thử lại dùng cùng payload, phiên bản gốc và khóa yêu cầu của
bản xem trước. Sau phản hồi đã lưu, danh sách và chi tiết tải lại từ
sổ. Bằng chứng nhập mới được PostgreSQL đối chiếu ở thời điểm ghi.

Để mở thẳng chi tiết trong chế độ tối, biểu tượng và nhãn chuyển theme
dùng cùng trạng thái ban đầu khi dựng trang và khi trình duyệt khởi
tạo. Màu nền vẫn lấy từ theme script trước khi React chạy.

Phân nhóm theo ngày dùng quy tắc UTC+7 cố định cho luồng này. Cách dùng
offset và thời điểm hiện hành dựa trên hợp đồng PostgreSQL.
[PostgreSQL Date/Time Functions](https://www.postgresql.org/docs/16/functions-datetime.html)

## Ảnh local

| Màn hình | Bằng chứng |
| --- | --- |
| Desktop 1440 × 900 | [Danh sách và lịch sử](evidence/m3b/desktop-history.png), [xem trước](evidence/m3b/desktop-preview.png) |
| Tablet 834 × 1112 | [Chi tiết và lịch sử](evidence/m3b/tablet-history.png) |
| Mobile 390 × 844 | [Nhóm quá hạn](evidence/m3b/mobile-groups.png), [chi tiết](evidence/m3b/mobile-history.png), [form xác nhận](evidence/m3b/mobile-edit.png) |
| Dark 1440 × 900 | [Mở thẳng chi tiết](evidence/m3b/dark-history.png) |

## Phạm vi kiểm chứng

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6, PostgreSQL 16
và Chromium 157.0.8103.51. Fixture dùng Next.js, GoTrue và PostgREST local.
Trình duyệt mô phỏng múi giờ Los Angeles trong các ca kiểm tra giao diện,
còn giờ hiển thị theo chính sách UTC+7 của sổ.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | Exit 0, 91 cảnh báo và 0 lỗi | [Log](evidence/m3b-lint.log) |
| `npm run typecheck` | Exit 0 | [Log](evidence/m3b-typecheck.log) |
| `npm run test:unit` | Exit 0, 100/100 | [Log](evidence/m3b-unit.log) |
| `npm run test:integration` | Exit 0, 168/168 | [Log](evidence/m3b-integration.log) |
| `npm run test:db` | Exit 0, 16 migration và các ca SQL về nhóm, hạn, phân trang và cách ly | [Log](evidence/m3b-db.log) |
| `npm run test:commitment-ui` | Exit 0, 14 ca Auth/RLS và 9 ca UI | [Log](evidence/m3b-browser.log), [JSON](evidence/m3b-browser-run.json) |
| `npm run test:design` | Exit 0, 25 ca hồi quy Inbox và giao diện dùng chung | [Log](evidence/m3b-design-regression.log), [JSON](evidence/m3b-design-regression.json) |
| `npm run test:commitment-ledger` | Exit 0, 14 ca Auth/RLS và 18 ca hồi quy API sổ cam kết | [Log](evidence/m3b-ledger-regression.log), [JSON](evidence/m3b-ledger-regression.json) |
| `npm run build` | Exit 0, biên dịch và tạo route `/commitments`. Next.js ghi cảnh báo import cấu hình Sentry đã lỗi thời. | [Log](evidence/m3b-build.log) |

Chromium báo 0 vi phạm axe gắn thẻ WCAG trong 7 trạng thái đã mở và 0
ngoại lệ chưa xử lý. Các ca thao tác kiểm tra mở thư nguồn, quay lại, giữ
focus, tải thêm, thử lại khi lỗi, xác nhận hạn mới, hoàn tất, mất phản
hồi sau commit và chặn lưu bản cũ. [Chi tiết Chromium](evidence/m3b/browser.json)

Ca giả lập đối chiếu ngày giao cũ và ngày đề nghị mới hiển thị cả hai
trích đoạn trong một lần mở chi tiết cam kết. Đường đi thủ công trong
cùng fixture mở hai email đã biết vị trí để đọc hai đoạn tương ứng.
Đây là số lần mở trong một ca, chưa đo thời gian thao tác của người dùng
hoặc chất lượng trên hộp thư thật.

Dữ liệu xác nhận do người dùng chọn và kiểm tra. M3-B dùng các cam kết đã
có qua API hoặc fixture, chưa có giao diện tạo cam kết và tự động trích
xuất từ thư. Firefox, Safari, WebView, thiết bị thật và trình đọc màn hình
chưa chạy. Phép đo axe giới hạn ở các trạng thái được mở trong Chromium.
Chưa đo hiệu năng với sổ lớn. Lần thử lại an toàn giữ cùng mã khi bản xem
trước còn mở. Sau khi đóng vì chưa nhận phản hồi, giao diện tải lại sổ
để kiểm tra trạng thái.

Đã dừng các dịch vụ và xóa tài nguyên Docker của fixture, thư mục
PostgreSQL tạm, chứng chỉ tạm và các tiến trình test. Lệnh
`docker image prune -f` ghi nhận 0 B thu hồi. Build dùng thư mục
`.next` và cấu hình giả lập, với 40 GiB trống trước khi chạy.

Có thể quay lại phiên bản ứng dụng trước và giữ các migration bổ sung.
Cổng sử dụng email thật và triển khai hosted vẫn áp dụng.
[Security gate](SECURITY_GATE.md)
