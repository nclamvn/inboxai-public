# M4-A Ask Inbox

Ngày 11/11/2026. Baseline `ef1ea8b`, nhánh
`phase2/m0-security-baseline-20261111`. Triển khai local với dữ liệu giả lập.
Hai đơn vị mã local là `ee63a6b` cho retrieval và `f8856b9` cho giao diện.

## Sử dụng

Trên desktop, mở **Ask Inbox** từ thanh điều hướng hoặc tìm từ ô tìm kiếm
chung. Trên mobile, mở **Tìm email → Mở Ask Inbox** trong Hộp thư.
Có thể chọn nhiều tài khoản, tên hoặc địa chỉ người gửi, khoảng ngày và
tệp đính kèm. Khi để trống tài khoản, hệ thống tìm trên các thư thuộc
người dùng, bao gồm thư cũ chưa gắn tài khoản. Khoảng ngày trên giao diện
tính cả hai đầu theo UTC+7. Toán tử như `from:`, `to:`, `subject:`,
`after:`, `before:`, `is:` và `has:attachment` vẫn có thể nhập cùng câu
tìm kiếm. `after:` gồm ngày đã nhập và `before:` loại ngày đã nhập.

Danh sách cho biết cách khớp, người gửi, tài khoản, ngày và trích đoạn
nguyên văn. Bấm tiêu đề để mở đúng thư và dùng Back để trở lại truy vấn
và bộ lọc. **Lưu cụm tìm kiếm** lưu phần văn bản, gồm toán tử đã gõ.
Giai đoạn này trả danh sách nguồn xếp hạng. Tổng hợp câu trả lời từ nguồn
thuộc M4-B.

## Mô hình và phạm vi

Chạy `npm run ask-inbox:model` một lần để lấy ba tệp công khai với tổng
dung lượng 135.391.358 byte vào `node_modules/.cache/inboxai-ask-e5`.
Có thể chỉ định thư mục bằng `ASK_INBOX_MODEL_DIR`. Mã xác minh SHA-256
của cả ba tệp khi cài và khi khởi tạo model. Runtime dùng ONNX Runtime
CPU và chỉ đọc tệp đã xác minh từ máy. Nếu model thiếu, lỗi hoặc đang bận,
giao diện cho biết đang hiển thị kết quả từ khóa.

Encoder dùng multilingual E5-small lượng tử hóa, đầu vào `query:` và
`passage:`, pooling theo token hợp lệ rồi chuẩn hóa L2. Mỗi email có tối
đa bốn đoạn chồng lấn, mỗi đoạn 640 ký tự, trên 2.320 ký tự đầu của nội
dung thư hoặc snippet và 280 ký tự đầu của tiêu đề. Search lập chỉ mục
tối đa 16 thư chưa lập chỉ mục mỗi lượt. **Phân tích thêm thư** tiếp tục
theo lô. So khớp ngữ nghĩa dùng điểm tích vô hướng của vector đã chuẩn
hóa trong tối đa 600 thư mới nhất sau lọc. Chỉ mục từ khóa bao phủ tiêu
đề, người gửi và 24.000 ký tự đầu của nội dung. Kết quả giới hạn 50 thư.
[Model card E5](https://huggingface.co/intfloat/multilingual-e5-small),
[ONNX revision](https://huggingface.co/Xenova/multilingual-e5-small/tree/761b726dd34fb83930e26aab4e9ac3899aa1fa78),
[PostgreSQL text search](https://www.postgresql.org/docs/16/textsearch-controls.html)

Xếp hạng kết hợp reciprocal rank fusion, giữ điểm ưu tiên khớp cụm từ
và nhận ứng viên ngữ nghĩa từ 0,82. Ngưỡng là tham số xếp hạng cục bộ
và chưa hiệu chuẩn trên thư thật. Truy vấn bộ lọc thuần trả nguồn theo
thứ tự ngày. Không lập chỉ mục nội dung tệp đính kèm hoặc HTML.

## Biên dữ liệu và rollback

RPC tìm kiếm lấy người dùng từ `auth.uid()` và xác minh tài khoản được
chọn trước khi lấy ứng viên. Bảng vector nằm trong schema private. API
chỉ gửi lô do máy chủ tính và truyền UUID lấy từ phiên xác thực vào RPC
ghi. RPC ghi kiểm tra chủ thư, trạng thái xóa và hash nội dung hiện tại
trước khi lưu. Trigger xóa vector khi nội dung đã lập chỉ mục đổi, hoặc
thư chuyển sang trạng thái xóa. Xóa hẳn thư dùng cascade. Trích đoạn được
lấy từ chính trường dữ liệu hiện tại và hiển thị dưới dạng văn bản.

Migration bổ sung hỗ trợ lịch sử và tìm kiếm đã lưu, do mã cũ đã gọi
bảng này nhưng các migration trước chưa tạo bảng. Lịch sử được giới hạn
theo tài khoản đăng nhập và thay đổi nguyên tử. Có thể quay về phiên bản
ứng dụng trước M4-A và giữ migration. Không có thao tác hosted trong
milestone này.
[Migration M4-A](../../supabase/migrations/20261111090000_ask_inbox.sql)

## Đánh giá retrieval local

Tập đánh giá gồm 25 thư giả lập có thể tìm kiếm trên hai tài khoản, cộng
các mẫu đối chứng bị xóa hoặc thuộc tenant khác. Có 11 câu truy vấn được
cố định trước lần chạy end-to-end đầu tiên, tách khỏi các câu dùng hiệu
chỉnh encoder. Hai nhánh chạy trên cùng dữ liệu, bộ lọc và chỉ mục đã
được làm nóng. Nhánh từ khóa gọi cùng API với `mode=keyword`. Lượt đo
HTTP chạy Next dev và PostgreSQL local. Chưa chạy đối chứng LLM trực tiếp,
agent hoặc tải hộp thư lớn.
[Truy vấn và nhãn giả lập](../../tests/design/ask-inbox-holdout.mjs),
[kết quả từng truy vấn](evidence/m4a/retrieval.json)

| Thước đo | Từ khóa | Kết hợp |
| --- | ---: | ---: |
| Nguồn được gán nhãn nằm trong top 5 | 4/9 | 6/9 |
| Top 5 trên truy vấn diễn đạt lại | 1/6 | 3/6 |
| Top 1 trên truy vấn chính xác | 3/3 | 3/3 |
| MRR trên 9 truy vấn có nguồn | 0,389 | 0,528 |
| Truy vấn không có nguồn đúng trả danh sách rỗng | 2/2 | 1/2 |
| Thời gian HTTP trung vị khi đã lập chỉ mục | 102 ms | 115 ms |
| Thời gian HTTP p95 trong mẫu 11 truy vấn | 113 ms | 123 ms |

Lượt đầu gồm biên dịch dev, nạp model và lập chỉ mục 16 thư mất 1.859 ms.
Lượt lập chỉ mục phần còn lại mất 163 ms. Bản kết hợp bỏ sót ba truy vấn
diễn đạt lại, trong đó có hai câu tiếng Anh tìm thư tiếng Việt. Một truy
vấn ngoài chủ đề trả về tám ứng viên ngữ nghĩa dù không có nguồn đúng
trong bộ thư. Các con số mô tả riêng fixture và phần cứng local.

## Kiểm chứng

macOS arm64, Node 24.14.1, npm 11.11.0, Next.js 16.4.6,
PostgreSQL 16, Chromium 157.0.8103.51 và ONNX Runtime 1.31.1.
Fixture dùng Auth/PostgREST/PostgreSQL local, email `.test`, SMTP sink
nội bộ và chặn fetch ngoài loopback.

| Lệnh | Kết quả quan sát | Bằng chứng |
| --- | --- | --- |
| `npm run test:unit` | Exit 0, 135/135 | [Log](evidence/m4a-unit.log) |
| `npm run test:integration` | Exit 0, 171/171, gồm kiểm tra API khi model không khả dụng | [Log](evidence/m4a-integration.log) |
| `npm run test:db` | Exit 0, 18 migration, gồm tìm thư trước migration, cách ly tenant và vô hiệu hóa vector | [Log](evidence/m4a-db.log) |
| `npm run test:ask-inbox` | Exit 0, 25 ca Auth, API và Chromium | [Log](evidence/m4a-browser.log), [JSON](evidence/m4a-browser-run.json) |
| `npm run test:design` | Exit 0, 25 ca hồi quy Inbox | [Log](evidence/m4a-design-regression.log), [JSON](evidence/m4a-design-regression.json) |
| `npm run lint` | Exit 0, 91 cảnh báo, 0 lỗi | [Log](evidence/m4a-lint.log) |
| `npm run typecheck` | Exit 0 sau build | [Log](evidence/m4a-typecheck.log) |
| `npm run build` | Exit 0, có `/search` và `/api/ask-inbox`. Còn cảnh báo import Sentry lỗi thời | [Log](evidence/m4a-build.log) |
| `npm audit --json` | Exit 1, 11 cảnh báo mức moderate. Hai package trực tiếp mới không được liệt kê | [JSON](evidence/m4a-audit.json) |

[Desktop có bộ lọc](evidence/m4a/desktop.png),
[tablet](evidence/m4a/tablet.png), [mobile có trích đoạn](evidence/m4a/mobile.png).
Axe ghi 0 vi phạm trong ba trạng thái lấy mẫu, Chromium ghi 0 lỗi runtime
hoặc hydration đã thu thập. [Chi tiết trình duyệt](evidence/m4a/browser.json)

Kiểm thử thiết bị là mô phỏng trong Chromium. Chưa kiểm Safari, Firefox,
WebView, thiết bị thật hoặc trình đọc màn hình.

Build dùng lại `.next` với cấu hình giả lập và 36 GiB trống trước khi chạy.
Trace của route có 189 mục, gồm thư viện ONNX native, 0 tệp trọng số
cache và 0 mục thuộc fixture, tài liệu Phase 2 hoặc `.git`.
Đã dừng các tiến trình test, xóa tài nguyên Docker của fixture, thư mục
PostgreSQL và chứng chỉ tạm. `docker image prune -f` thu hồi 0 B.
Giữ lại cache trọng số đã xác minh để tiếp tục chạy local.
