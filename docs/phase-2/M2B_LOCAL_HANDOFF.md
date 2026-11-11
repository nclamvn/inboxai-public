# M2-B Action Inbox

Ngày 11/11/2026. Baseline `8ae12d2`, nhánh
`phase2/m0-security-baseline-20261111`. Triển khai và kiểm thử trong
checkout local với thư và tài khoản giả lập.

Các đơn vị review local gồm `8bff3d2` cho bộ xếp hạng và lưu ưu tiên,
`c834662` cho UI, `4dfcfcb` cho kiểm thử, và `42cbc49` cho truy vấn định kiểu.

## Luồng người dùng

- Inbox xếp thư thành Cần xử lý, Hộp thư chính và Đọc sau. Sự cố hoặc cảnh báo
  bảo mật trong 7 ngày, hạn trong 48 giờ hoặc quá hạn tối đa 7 ngày, yêu cầu phản hồi và
  dấu sao là tín hiệu để đưa thư lên trước. Mở đọc thư không hạ ưu tiên.
  Biên lai đã hoàn tất và bản tin thông thường vào Đọc sau.
- Mỗi lý do có đường dẫn về email thuộc phạm vi người dùng. Khi tín hiệu
  đến từ tiêu đề hoặc nội dung xem trước, hộp thoại trích nguyên cụm từ
  đã khớp. Lý do dựa trên phân tích lưu sẵn được ghi rõ. Nếu thư không còn
  khả dụng, màn đọc cho thử mở lại hoặc quay về Inbox.
- Trong hộp thoại **Ưu tiên và nguồn**, người dùng có thể chọn Cần xử lý,
  Đọc sau hoặc Tự động. Sau khi lưu, thư đổi nhóm theo lựa chọn. Hai thư
  đã sửa gần nhất trong 90 ngày, cùng người gửi và tài khoản, có thể điều
  chỉnh thứ tự giữa các thư cùng mức khi hai lựa chọn nhất quán. Phần giải
  thích dẫn về cả hai thư. Tín hiệu sự cố và hạn gần giữ thứ tự độc lập
  với cơ chế học này.

## Hợp đồng dữ liệu

[Migration](../../supabase/migrations/20261111050000_action_inbox.sql) bổ sung
hai cột ưu tiên và phiên bản trên hàng email hiện hữu. Email cũ bắt đầu ở
Tự động. RPC chạy với quyền người gọi, lọc `auth.uid()` và chỉ áp dụng cho
thư đến còn trong Inbox. Quyền gọi thuộc role authenticated. Bản sửa dùng
khóa hàng và so phiên bản. Khi hai phiên sửa khác nhau, phiên sau thấy
lựa chọn mới nhất và có thể xác nhận lại. Khi mất phản hồi, thử lưu cùng
lựa chọn nhận lại phiên bản đã lưu. Đồng bộ nguồn và phân loại cập nhật
các trường riêng của chúng.

Preview là computed field trả tối đa 480 ký tự văn bản từ hàng đã qua RLS.
Bộ xếp hạng dùng tối đa 512 ký tự đầu của tiêu đề. Không tạo bản sao lưu
thêm của nội dung, không gọi LLM mới và không dùng nội dung thư làm chỉ
dẫn điều khiển. Danh sách phân trang theo `received_at DESC NULLS LAST, id DESC`
để giữ cả các thư cùng thời điểm nhận và các thư cũ thiếu ngày nhận. Khi
bộ lọc chưa có kết quả, người dùng vẫn có thể tải trang tiếp theo.

[Tham chiếu quyền của Supabase database functions](https://supabase.com/docs/guides/database/functions)
và [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Đối chứng trên dữ liệu giả lập

Chạy `node --import tsx tests/eval/action-inbox.mjs`. Bộ 24 ca do người triển
khai tự gán nhãn và tách khỏi fixture unit. Đối chứng dùng công thức nhóm
Cần xử lý của M2-A trên cùng dữ liệu. Đánh giá nhị phân ở cấp thư, chưa
đo thứ tự trong nhóm, thời gian thao tác hoặc chất lượng thị trường.

| Phép đo | TP | FP | TN | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Quy tắc M2-A | 2 | 10 | 2 | 10 | 16,7% | 16,7% |
| M2-B lần đầu | 9 | 1 | 11 | 3 | 90% | 75% |
| M2-B sau khi sửa ca bảo trì trên cùng tập | 9 | 0 | 12 | 3 | 100% | 75% |

Sai dương ban đầu là thư báo dừng dây chuyền theo kế hoạch bảo trì.
Ba sai âm còn lại là sự cố tiếng Tây Ban Nha, yêu cầu tiếng Việt diễn đạt
gián tiếp và yêu cầu nằm sau giới hạn preview. Kết quả chạy lại là kiểm tra
sửa lỗi trên các ca đã biết. Chưa có bộ nhãn độc lập, đối chứng LLM hoặc
agent chạy local. Không dùng kết quả để suy ra chất lượng trên email thật.

[Kết quả lần đầu](evidence/m2b-ranking-eval-initial.json) và
[kết quả chạy lại](evidence/m2b-ranking-eval.json).

## Bằng chứng local

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6, PostgreSQL 16 và
Chromium 157.0.8103.51. Ổ đĩa còn 43 GiB trước build. Dùng biến môi
trường giả lập theo CI và Supabase loopback.

| Lệnh | Kết quả | Bằng chứng |
| --- | --- | --- |
| `npm run lint` | Exit 0, 91 cảnh báo và 0 lỗi | [Log](evidence/m2b-lint.log) |
| `npm run typecheck` | Exit 0 | [Log](evidence/m2b-typecheck.log) |
| `npm run test:unit` | Exit 0, 89/89 | [Log](evidence/m2b-unit.log) |
| `npm run test:integration` | Exit 0, 168/168 | [Log](evidence/m2b-integration.log) |
| `npm run test:db` | Exit 0, 14 migration, kiểm tra quyền, rollback và sync replay giữ ưu tiên | [Log](evidence/m2b-db.log) |
| `npm run test:local-auth` | Exit 0, 82/82 hồi quy Auth, vault, sync và gửi | [Log](evidence/m2b-local-auth.log), [JSON](evidence/m2b-local-auth.json) |
| `npm run test:action-inbox` | Exit 0, 14 ca Auth/RLS, 5 ca upgrade/API và 19 ca UI | [Log](evidence/m2b-browser.log), [JSON](evidence/m2b-browser-run.json) |
| `npm run build` | Exit 0, compile, TypeScript và prerender hoàn tất | [Log](evidence/m2b-build.log) |

Hai người dùng và vai trò anonymous được kiểm tra bằng PostgreSQL và
PostgREST local. Chromium kiểm tra liên kết mở đúng thư, lưu qua tải lại,
mất phản hồi sau commit, khôi phục ưu tiên tự động, mất trang rồi thử lại
và các thư cùng mốc thời gian. Axe báo 0 vi phạm gắn thẻ WCAG trong 9
trạng thái lấy mẫu. Kết quả trình duyệt được lưu riêng. [JSON](evidence/m2b/browser.json)

[Desktop](evidence/m2b/desktop.png), [hộp thoại ưu tiên](evidence/m2b/desktop-priority.png),
[tablet](evidence/m2b/tablet.png), [mobile](evidence/m2b/mobile-priority.png)
và [giao diện tối](evidence/m2b/dark.png).

Theo manifest build, tài nguyên JavaScript khởi tạo Inbox tăng 4.892 byte gzip,
CSS tăng 18 byte gzip so với M2-A. Tổng mức tăng khoảng 1,13%. Phạm vi đo
chưa tính các gói tải sau, font hoặc thời gian tải. [Số byte M2-B](evidence/m2b-bundle.json)

## Giới hạn và quay lui

Xếp hạng và học ưu tiên có phạm vi các trang đã tải và tài khoản đang xem.
Tín hiệu hạn và cần phản hồi từ dữ liệu cũ là gợi ý. Một phản hồi gửi đi
không tự đóng cam kết. M3-A sẽ xử lý danh tính cam kết, thay đổi hạn và
trạng thái có chứng cứ. Các ảnh tablet/mobile dùng mô phỏng Chromium.
Safari, WebView, thiết bị thật và đọc màn hình thủ công chưa kiểm thử.

Khi cần quay lại, hoàn nguyên ứng dụng trước và giữ migration bổ sung để
bảo toàn lựa chọn đã lưu. Index mới được tạo trong migration có giao dịch.
Cần đo thời gian khóa trên bản sao có quy mô phù hợp trước khi lên staging.
[Security gate](SECURITY_GATE.md) tiếp tục quản lý quyền sử dụng email thật
và production.

Đã dọn PostgreSQL tạm, container và network của fixture Docker Compose,
listener loopback và thư mục chứng chỉ thử nghiệm. `docker image prune -f`
thu hồi 0 B. Build dùng `.next` trong checkout hiện tại.
