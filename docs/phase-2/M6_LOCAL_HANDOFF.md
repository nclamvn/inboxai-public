# M6 · Nghiệm thu InboxAI 2.0 trên máy local

Ngày 12/11/2026. Nhánh `phase2/m0-security-baseline-20261111`. Mã ứng dụng
và migration khớp checkpoint `d438220`. Toàn bộ tình huống dùng thư, tài khoản,
quyền OAuth và quyết định nghiệp vụ giả lập. Những lần gửi thử chỉ đi đến
Mailpit hoặc Gmail mô phỏng trên máy.

## Người dùng đã làm được gì

Trong vai nhân viên mua hàng, người dùng đăng nhập, thấy thư đổi lịch được ưu
tiên và mở được email giải thích lý do. Sau khi xác nhận cam kết gốc và ngày
giao mới, lịch sử lưu hai phiên bản của cùng một cam kết. Ask Inbox đối chiếu
bằng chứng trên hai tài khoản, giữ đúng phạm vi khi lọc và báo thiếu dữ kiện khi
không thấy hồ sơ. Người dùng duyệt phạm vi lưu trữ một thư, xem kết quả đã xác
minh sau khi tải lại rồi hoàn tác. Khi mất phản hồi gửi thư, thao tác thử lại
chỉ tạo một thư ở Mailpit. [Kịch bản mua hàng](M6D_LOCAL_HANDOFF.md) ·
[Kết quả end-to-end](../../test-results/m6g/closeout-e2e.json)

Cùng bộ kiểm tra chạy tình huống Google mô phỏng từ kết nối đọc đến cấp, từ
chối và thu hồi quyền gửi. Thư chứa chỉ dẫn giả và HTML độc hại không thay đổi
kết luận có nguồn hoặc quyền thao tác. Tài khoản thứ hai và phiên ẩn danh bị
chặn khi mở thư, tệp đính kèm hoặc kế hoạch thuộc tài khoản khác. Một thay đổi
xảy ra sau phê duyệt khiến Operator từ chối cả lô. [Quyền Gmail](VERIFICATION.md#m6-e-gmail-consent) ·
[Tình huống đối kháng](VERIFICATION.md#m6-f-adversarial-security-rehearsal)

## Kết quả nghiệm thu và phạm vi

| Hạng mục | Bằng chứng local |
| --- | --- |
| Luồng sản phẩm và bảo mật | 41 kiểm tra end-to-end qua trình duyệt và API với Next.js build production mode, GoTrue, PostgREST và PostgreSQL local. Lượt kiểm tra gần nhất chạy ngày 12/11/2026. [JSON](../../test-results/m6g/closeout-e2e.json) · [Log](../../test-results/m6g/closeout-e2e.log) |
| Hồi quy | Lượt kiểm tra trước đó có TypeScript đạt, 238 unit test, 197 integration test, 4 test bộ chấm và lint 0 lỗi, 91 cảnh báo hiện hữu. [Lệnh và kết quả](VERIFICATION.md) |
| Hiệu năng và khả năng truy cập | Với 600 thư giả lập, dữ liệu bản tin giảm từ 3,80 MB xuống 153 kB. Có bằng chứng đọc thư và phục hồi focus trên desktop, tablet và mobile web, cùng ba trình giả lập native. Phạm vi axe và thiết bị được ghi trong biên bản. [Nền tảng](M6A_LOCAL_HANDOFF.md) |
| Nâng cấp và khôi phục | 31 kiểm tra staging trước đó bao gồm nâng cấp từ dữ liệu cũ, từ chối backup hỏng, khôi phục và đăng nhập lại, kiểm tra dữ liệu và quyền sau khôi phục, nhận rồi đóng cảnh báo. [Diễn tập](M6B_LOCAL_HANDOFF.md) |
| Đích kết nối mail | Ca thử DNS và TLS dùng điểm đích giả lập. Cơ chế chặn đích SMTP/IMAP bị cấm bảo toàn biên nhận gửi và vị trí đồng bộ đã lưu. [Kiểm tra đích kết nối](VERIFICATION.md#m6-c-smtp-and-imap-destination-controls) |

## Commitment Intelligence còn thiếu gì

Trên 25 thư trong 10 hồ sơ viết riêng cho M6-G, InboxAI tìm đúng **10/17 sự
kiện**, với 1 đề xuất sai và 6/14 sự kiện quan trọng bị bỏ sót. LLM trực tiếp
và agent cùng tìm đúng **14/17**, với lần lượt 7 và 8 đề xuất sai. Điểm hụt của
InboxAI tập trung ở nhiều cam kết trong cùng thư, hạn tương đối và diễn biến
sau khi đổi người phụ trách. Bộ nhãn do tác giả tập thử gán. Các số liệu này
đo khả năng phát hiện trên mẫu giả lập và chưa xác lập chất lượng trên hộp thư
thực tế. [Dữ liệu, thời gian và công rà soát](M6G_LOCAL_HANDOFF.md#kết-quả-tự-động)

Codex đã chạy hết form đối chứng qua ba hồ sơ đã biết, xuất đúng **5/5 sự kiện**
và kiểm chứng hồ sơ rỗng chỉ nộp được sau khi chọn **Không có sự kiện**. Đây là
kết quả kiểm thử form. Thời gian đọc thư và công xác nhận của người dùng vẫn
chưa có số đo hợp lệ. [Nghiệm thu form](M6G_LOCAL_HANDOFF.md#nghiệm-thu-bằng-chrome-local-ngày-12112026)

Luồng làm việc tổng hợp và diễn tập vận hành đã được kiểm chứng trong phạm vi
local. Kết quả phát hiện cam kết còn dưới mức cần thiết để người dùng dựa vào
đề xuất cho các hạn quan trọng. Kết quả tiếp theo cần nghiệm thu trọn luồng là
phát hiện và theo dõi một cam kết từ lúc hình thành, đổi hạn hoặc đổi người
đến khi đóng, với nguồn cho từng lần thay đổi và đo lại trên bộ hồ sơ giả lập
mới. Hộp thư thật và production tiếp tục theo [security gate](SECURITY_GATE.md).
