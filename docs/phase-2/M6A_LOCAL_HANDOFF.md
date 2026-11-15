# M6-A hiệu năng, end-to-end và accessibility

Ngày 12/11/2026. Baseline `05d2ce6`, nhánh `phase2/m0-security-baseline-20261111`.
Các commit local gồm `bc64988` cho bản tin, `cd40d99` cho focus và vòng đời native,
`01995ae` cho đồng bộ nền và gói native, `66f93bd` cho bộ kiểm thử nền tảng.
Toàn bộ diễn tập dùng tài khoản, thư và nội dung giả lập. Build Next.js chạy
ở production mode trên máy local. Fixture tự dựng GoTrue, PostgREST,
PostgreSQL 16 và Mailpit. Browser chỉ được truy cập các cổng loopback của fixture.

## Thay đổi

- Header chỉ khởi chạy truy vấn khi được hiển thị. Inbox desktop và tablet vẫn
  có bản tin từ thanh điều khiển của Inbox. Inbox mobile bỏ được request bản tin
  và hồ sơ do Header ẩn tạo ra.
- Bản tin truy vấn các cột metadata phục vụ thống kê, thay cho toàn bộ dòng email.
  Tra cứu người gửi VIP dùng tập hợp địa chỉ. Fixture xác nhận số thư, số chưa đọc
  và phân loại công việc giữ nguyên trên hai tài khoản.
- Đồng bộ nền giữ lịch polling khi request thất bại. Phản hồi 503 và sự kiện lấy
  lại focus không còn khởi động lại timer mỗi lần cập nhật trạng thái.
- Khi mở thư, focus chuyển tới tiêu đề. Vùng nội dung dài có tên truy cập và nhận
  focus để cuộn bằng bàn phím. Khi quay lại, focus trở về dòng thư nếu còn hiển thị.
  Bản mobile dùng vùng an toàn dưới của thiết bị và xuống dòng chuỗi văn bản dài.
- Native shell khởi tạo qua Capacitor, đồng bộ giao diện thanh trạng thái, chỉ tải
  plugin ở native, điều chỉnh WebView khi bàn phím iOS hiện và đăng ký một bộ xử lý
  Back trên Android. Điều hướng web dùng cùng Inbox và cùng API được xác thực.
- Trên iOS 27, bản cũ dừng khi mở app với lỗi thiếu vòng đời scene. Shell chuyển
  sang `UIScene` và chuyển tiếp URL qua Capacitor. Gói cài đặt kèm trang thông báo
  khi không kết nối được. [Crash baseline](evidence/m6a/ios-startup-before.json) · [Tài liệu vòng đời UIKit của Apple](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle)
- CSP cho phép origin Supabase đã cấu hình. Với HTTP, chỉ cho phép Supabase
  loopback khi app cũng được phục vụ qua HTTP loopback. Kiểm thử có ca xác nhận
  HSTS và `upgrade-insecure-requests` vẫn áp dụng cho request HTTPS ngoài loopback.

## Kết quả đo

600 email giả lập trên hai tài khoản, mỗi email có 140 lần lặp của câu mẫu.
Đo trên Chromium 157.0.8103.51 với mỗi kích thước dùng browser context mới.
Đo byte JSON tại proxy PostgREST và đếm các request từ trình duyệt đến khi
network idle. Baseline dùng bản build của `05d2ce6`. Fixture cho phép chính xác
origin Supabase loopback trong header CSP của bản baseline để đo được luồng Inbox.
Bản sau sửa chạy CSP từ ứng dụng. Cả hai được cấp quyền mạng local cho đúng origin
của fixture trong Chromium.

| Chỉ số | Trước | Sau | Ngưỡng fixture |
| --- | ---: | ---: | ---: |
| JSON PostgREST mỗi lần đọc cho bản tin | 3.802.787 B | 152.548 B | ≤ 256 KiB |
| Request bản tin khi mở Inbox desktop / tablet / mobile | 2 / 2 / 1 | 1 / 1 / 0 | 1 / 1 / 0 |
| Request hồ sơ khi mở Inbox desktop / tablet / mobile | 1 / 1 / 1 | 0 / 0 / 0 | 0 / 0 / 0 |
| JavaScript mã hóa truyền đến lúc network idle | 431.351 B | 432.096 B | ≤ 550 KiB |
| Thấy dòng thư đầu tiên, desktop / tablet / mobile | 1.173 / 1.029 / 1.055 ms | 981 / 961 / 966 ms | ≤ 5.000 ms |

Payload bản tin giảm khoảng 96%. JavaScript tăng 745 B. Mỗi viewport có một lần đo
local và tải hệ thống khác nhau, nên chưa đủ mẫu để kết luận về tác động lên thời
gian tải thực tế. Chưa đo Core Web Vitals ngoài thực địa. Endpoint bản tin vẫn dùng giới hạn hàng
hiện hành của PostgREST. M6-A chưa đo hộp thư trên 600 email.
[Baseline](evidence/m6a/before.json) · [Sau sửa](evidence/m6a/after.json)

## Tái hiện native local

Chuẩn bị debug app từ cấu hình Capacitor hiện có. Chạy `npx cap copy ios` và
`npx cap sync android` sau khi tạo thư mục `android/app/src/main/assets` nếu thiếu.
Trong hai JSON **được sinh local**, đặt `server.url` bằng `http://127.0.0.1:55300`
và `appendUserAgent` bằng ` InboxAI-M6-Local`. Với Android, dùng cấu hình mạng
riêng cho debug, giới hạn cleartext đến `127.0.0.1`. Giữ nguyên cấu hình release.

Build iOS Simulator vào `ios/DerivedData` bằng Xcode và Android debug với JDK 21,
SDK 36 và `:app:assembleDebug`. Boot simulator riêng cho fixture. Truyền các UDID
qua `M6_IOS_SIMULATORS=ios-phone=UDID,ios-tablet=UDID` và/hoặc serial giả lập Android
qua `M6_ANDROID_SERIAL=emulator-PORT`. Dùng `M6_ADB` nếu `adb` nằm ngoài PATH.
Chạy `npm run test:platform -- --native-shells`. Harness kiểm tra URL loopback trong
app đã đóng gói trước khi cài và khởi chạy. Android nối hai cổng local qua `adb reverse`.

Fixture lấy session từ bước xác thực giả lập, nạp axe qua proxy loopback và thực
hiện luồng Inbox → đọc thư → trở lại Inbox trong WebView. Probe kiểm tra platform
của Capacitor, focus, tràn ngang và các quy tắc axe đã chọn. Kiểm thử Android gửi
phím Back qua ADB. Kiểm thử iOS đọc lại chế độ resize từ plugin Keyboard. Kiểm thử
WebView dùng thao tác tự động trên DOM. VoiceOver, TalkBack, bàn phím vật lý và
thiết bị thật chưa được xác minh.

| Native shell | Viewport đo được | Kết quả |
| --- | --- | --- |
| iPhone 17, iOS 27 Simulator | 402 × 840 | Mở thư, đọc lại `KeyboardResize.Native`, quay lại và trả focus. [Ảnh](evidence/m6a/ios-phone.png) |
| iPad mini A17 Pro, iOS 27 Simulator | 744 × 1113 | Mở thư, đọc lại `KeyboardResize.Native`, quay lại và trả focus. [Ảnh](evidence/m6a/ios-tablet.png) |
| Android API 36, WebView 133 | 412 × 915 | Mở thư, phím Back ADB quay lại và trả focus. [Ảnh](evidence/m6a/android-phone.png) |

Ba ca native đều không tràn ngang hoặc có vi phạm trong tập quy tắc axe đã chạy.
Xcode 27.2 và Gradle 8.14.3/JDK 21 build debug thành công. Trên iPad, axe phát
hiện độ tương phản thấp trong hoạt ảnh hiện nội dung thư. Bản cuối bỏ hoạt ảnh
đó và chạy lại ba simulator. Luồng đọc thư dùng metadata, nội dung và bản tóm tắt
lưu sẵn từ fixture. Chưa kiểm chứng deep link, đăng nhập OAuth native, xoay màn
hình hoặc Split View. [Kết quả native](evidence/m6a/native-ios-phone-ios-tablet-android-phone.json) · [Build iOS](evidence/m6a-ios-build.log) · [Build Android](evidence/m6a-android-build.log)

## Kiểm tra hồi quy

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6, Chromium 157.0.8103.51
và PostgreSQL 16. Các ca Auth dùng chung xuất hiện trong nhiều lệnh, không cộng dồn.

| Lệnh | Kết quả local | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | 0 lỗi, 91 cảnh báo baseline | [Lint](evidence/m6a-lint.log) |
| `npm run typecheck` | Exit 0 | [TypeScript](evidence/m6a-typecheck.log) |
| `npm run test:unit` | Exit 0, 188/188 | [Unit](evidence/m6a-unit.log) |
| `npm run test:integration` | Exit 0, 174/174 | [Integration](evidence/m6a-integration.log) |
| `npm run test:db` | Exit 0, 16 nhóm SQL và cạnh tranh ghi | [SQL](evidence/m6a-db.log) |
| `npm run test:design` | Exit 0, 25 ca trên fixture gồm Auth và hồi quy thiết kế | [Design](evidence/m6a-design.log) |
| `npm run test:platform` | Exit 0, 19 ca. Desktop, tablet và mobile mở thư, cuộn bằng bàn phím, đóng và trả focus | [Web](evidence/m6a-browser.log) |
| `npm run test:platform -- --native-shells` | Exit 0, 17 ca gồm 14 Auth và ba native | [Native](evidence/m6a-native.log) |
| `npm run build` | Exit 0, cấu hình giả lập. Còn cảnh báo Sentry deprecation | [Build](evidence/m6a-build.log) |

Viewport web 1440 × 900, 834 × 1112 và 390 × 844. Axe kiểm tra Inbox và màn đọc
ở cả ba kích thước. [Baseline web](evidence/m6a-baseline-measured.log)

## Phạm vi phát hành

Không push, deploy, chạy CI từ xa, kết nối Gmail/IMAP thật hoặc gửi email thật.
Kiểm thử không dùng model bên ngoài. M6-A không thay schema hoặc quyền kết nối
mailbox. Có thể quay về build app và web của M5-B cùng dữ liệu hiện có.

Đã xóa hai iOS simulator và Android AVD tạo cho đợt thử. Đã dọn DerivedData, SDK
Android, JDK, Gradle, bản cài debug và tài nguyên Capacitor sinh trong repo. Dùng
thư mục `.next` hiện có. `docker image prune -f` thu hồi 0 B. [Nhật ký dọn dẹp](evidence/m6a-cleanup.log)
