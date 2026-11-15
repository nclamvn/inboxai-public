# M2-A Design System

Ngày 11/11/2026. Baseline `f70af62`, nhánh
`phase2/m0-security-baseline-20261111`. Triển khai và kiểm thử trong checkout
local với dữ liệu giả lập.

Các đơn vị review local gồm `1c21713` cho token và primitives, `c57bada`
cho các màn hình tham chiếu và `91b7f23` cho kiểm thử và đo bundle.

## Chuẩn dùng chung

- [Token CSS](../../src/styles/neo-flat.css) là nguồn duy nhất cho màu, focus,
  đường nhấn, bán kính và vùng chạm. Light dùng Navy `#174A72`, canvas
  `#F7F9FA`, surface `#FFFFFF`, border `#E1E7EB`, chữ `#192532`. Dark dùng
  nền xanh than và vạch chọn xanh nhạt để giữ độ tương phản. Dùng lưới 4 px,
  vạch chọn thẳng 2 px, bán kính 4 px cho điều khiển và 8 px cho panel.
- [Inter tự phục vụ](../../src/styles/inter.css) dùng WOFF2 biến thiên cho
  Latin, Latin Extended và tiếng Việt. Các icon Lucide mô tả hành động thực tế.
  Nền và đường phân cách thể hiện cấu trúc, còn màu trạng thái dành cho tín
  hiệu ngắn như cảnh báo và lỗi.
- [Primitives](../../src/components/ui/) dùng chung token cho nút, ô nhập,
  textarea, badge, card, cảnh báo, toast, skeleton, trạng thái rỗng và dialog.
  Dialog gốc của trình duyệt quản lý focus và nền bất hoạt, hỗ trợ Escape và
  trả focus về nút mở.
- Shell, Inbox, đọc thư và Compose là các màn tham chiếu. Desktop tách danh
  sách và nội dung khi đọc. Tablet dùng thanh điều hướng có thể mở rộng và
  màn đọc riêng. Mobile dùng điều hướng dưới có safe area và vùng chạm tối
  thiểu 44 px cho các điều khiển chính. Hộp thư thể hiện riêng trạng thái tải,
  trống, lọc rỗng, lỗi có thể thử lại và mất kết nối.

## Ảnh chụp local

| Kích thước mô phỏng | Ảnh |
| --- | --- |
| Desktop 1440 × 900 | [Inbox](evidence/m2a/desktop.png), [đọc hai cột](evidence/m2a/desktop-reading.png) |
| Tablet 834 × 1112 | [Inbox](evidence/m2a/tablet.png) |
| Mobile 390 × 844 | [Inbox](evidence/m2a/mobile.png), [lọc danh mục](evidence/m2a/mobile-filter.png), [Compose](evidence/m2a/mobile-compose.png) |
| Desktop tối 1440 × 900 | [Inbox](evidence/m2a/dark.png), [hộp thư trống](evidence/m2a/dark-empty.png) |

## Kết quả kiểm thử

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6 và Chromium
157.0.8103.51. Còn 44 GiB trên ổ đĩa trước build. Build dùng cổng loopback
và biến môi trường giả lập theo CI.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | Exit 0, 91 cảnh báo và 0 lỗi | [Log](evidence/m2a-lint.log) |
| `npm run typecheck` | Exit 0 | [Log](evidence/m2a-typecheck.log) |
| `npm run test:unit` | Exit 0, 81/81 | [Log](evidence/m2a-unit.log) |
| `npm run test:integration` | Exit 0, 168/168 | [Log](evidence/m2a-integration.log) |
| `npm run test:db` | Exit 0, chạy đủ 13 migration và các ca SQL | [Log](evidence/m2a-db.log) |
| `npm run test:local-auth` | Exit 0, 82/82 ca Auth, vault, sync và gửi với fixture | [Log](evidence/m2a-local-auth.log), [JSON](evidence/m2a-local-auth.json) |
| `npm run test:design` | Exit 0, 11 ca UI và 14 ca Auth/RLS | [Log](evidence/m2a-browser.log), [JSON](evidence/m2a-browser-run.json) |
| `npm run build` | Exit 0, compile, TypeScript và prerender hoàn tất | [Log](evidence/m2a-build.log) |
| `npm audit --audit-level=high` | Exit 0, 11 moderate, 0 high/critical | [Log](evidence/m2a-audit.log) |

[Kết quả browser](evidence/m2a/browser.json) ghi nhận 0 vi phạm axe gắn thẻ
WCAG trong 7 trạng thái đã mở và 0 ngoại lệ JavaScript chưa xử lý. Các ca
thao tác kiểm tra skip link, viền focus, vạch chọn 2 px, Escape và trả focus,
vùng chạm, chọn người gửi, Enter tạo bản nháp mà không gọi API gửi, trạng
thái rỗng, lỗi có thể thử lại và mất kết nối. Ảnh chụp ẩn chỉ báo Next dev.

## Dung lượng tài nguyên Inbox

`npm run design:bundle` đếm các tệp bootstrap và entry Inbox trong manifest
build, loại bỏ đường dẫn trùng. Số trước lấy từ build local tại baseline M1-C.
Phép đo gzip từng tệp chưa tính font, lazy chunks, cache hay thời gian tải.

| Tài nguyên | Baseline (byte gzip) | M2-A (byte gzip) | Chênh lệch (byte) |
| --- | ---: | ---: | ---: |
| JavaScript | 414.834 | 413.758 | −1.076 |
| CSS | 20.694 | 20.910 | +216 |
| Tổng | 435.528 | 434.668 | −860 |

[JSON trước](evidence/m2a-bundle-before.json) và
[JSON sau](evidence/m2a-bundle-after.json) giữ số byte thô và gzip.
Ba tệp Inter biến thiên phát hành từ app có tổng dung lượng 143.576 byte.
Trình duyệt dùng Unicode ranges để chọn các subset theo ký tự cần hiển thị.

## Phạm vi kiểm chứng

Browser rehearsal dùng Chromium, Next dev và Auth/PostgREST/PostgreSQL chạy local.
Dữ liệu nguồn gồm hai tài khoản `.test` và tám email giả lập. Yêu cầu đồng bộ và
gửi từ browser bị chặn. Phản hồi tóm tắt, gợi ý và tạo nháp trong bài kiểm thử
là fixture. Bằng chứng đo UI và tương tác, còn chất lượng LLM thuộc các milestone
sản phẩm sau.

Các trang đăng nhập, cài đặt, phân tích và phần giao diện chuyên biệt chưa
được chuyển đồng bộ sang thiết kế mới. Axe chỉ đánh giá các trạng thái đã mở
trong bài kiểm thử. Nút đính kèm ở Compose là điều khiển kế thừa chưa nối
với luồng tải tệp. Chưa chạy Safari/Firefox, WebView hoặc thiết bị iOS/Android
thật, đọc màn hình thủ công, hay đo hiệu năng lúc chạy. Modal mới dùng native
`showModal()`. Cần đối chiếu iOS deployment target 15.0 với WebKit trên thiết bị
trước khi chứng nhận khả năng tương thích native.

M2-B sẽ dùng các bề mặt này cho ưu tiên theo ngữ cảnh, lý do, nguồn và lưu
chỉnh sửa của người dùng. Trình tự và điều kiện nghiệm thu nằm trong
[kế hoạch Phase 2](IMPLEMENTATION_PLAN.md). [Security gate](SECURITY_GATE.md)
cho dữ liệu thật và production vẫn đóng.

Khi cần quay lại thiết kế trước M2-A, hoàn nguyên các commit M2-A theo thứ tự
ngược. Scope này chỉ có ứng dụng, dependency và kiểm thử. Bộ kiểm thử có thể
chạy lại bằng `npm run test:design` với Docker và Chrome local. Có thể trỏ
`INBOXAI_CHROMIUM_PATH` tới binary Chromium trên máy.

Các fixture đã dọn gồm PostgreSQL tạm, container và network của Docker
Compose, listener loopback và thư mục chứng chỉ tạm. `docker image prune -f`
thu hồi 0 B. Build dùng `.next` trong checkout hiện tại.

Tham chiếu kỹ thuật gồm [Inter tự phục vụ](https://fontsource.org/fonts/inter/use),
[mô phỏng thiết bị với Playwright](https://playwright.dev/docs/emulation),
[kích thước vùng chạm WCAG](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
