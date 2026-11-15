# Tìm thư bổ sung cho hồ sơ đang chờ

Trong **Hộp thư → Cam kết cần chú ý → Hồ sơ mua hàng cần xử lý**, Mua hàng
thấy ứng viên bổ sung ngay dưới yêu cầu hiện hành. Kết quả hiển thị hóa
đơn mới, hóa đơn bị thay thế, hạn trên tệp và email nguồn. Chọn **Xem
trước chứng từ mới** để mở đúng tệp. Người dùng vẫn xác nhận ghi nhận
hóa đơn và bàn giao. Kế toán duyệt trong luồng tách quyền hiện có.

InboxAI khoanh vùng thư đã đồng bộ theo người gửi, hộp thư gốc và mã PO
trên tiêu đề. Sau đó đối chiếu nội dung hóa đơn CSV, mã PO trong tệp,
đợt hóa đơn, thời điểm nguồn và bản đang hiệu lực. Tên tệp không định
danh chứng từ. Hai tệp cùng tên được phân biệt bằng ID MIME và nội dung.
Bản gửi lại có cùng byte chỉ hiện một lần. Hai bản khác nhau cùng có thể
thay một hóa đơn được đưa ra đối chiếu riêng. Sai mã, thiếu hạn khi hồ
sơ yêu cầu, bản cũ và tệp không xác định được bản thay thế có lý do riêng.

Lượt dò là yêu cầu đọc riêng khỏi tải Inbox, tối đa bốn hồ sơ, sáu tệp
gần nhất mỗi hồ sơ, ba lượt tải đồng thời và tám giây. Tệp tối đa 8 KiB.
Nếu vượt giới hạn hoặc nguồn không khả dụng, mục kết quả báo chưa rà
hết. Phạm vi đọc và kiểm tra bám theo hộp thư của Mua hàng được xác
thực. Sau khi người dùng ghi nhận, nội dung, hồ sơ chưa khép và phiên
bản còn hiệu lực được kiểm tra lại. Thử lại dùng biên nhận của sổ hóa đơn.

## Phép đo local

Kịch bản Chrome dùng hai Gmail giả lập và một tình huống PO-9422. Đường
tìm theo các thư ứng viên yêu cầu mở ba email và xem nội dung tệp để
chọn bản mới; thẻ Inbox mở thẳng đúng bản xem trước với không lần mở
email. Tiêu chí chọn đúng dựa vào ID tệp, mã hóa đơn và bản bị thay thế.
Đây là đối chứng thao tác trên tình huống đã định, chưa đo thời gian
người dùng thật, tỷ lệ bao phủ trên nhiều nhà cung cấp hay chất lượng
của một mô hình trích xuất mới. Quy tắc hiện áp dụng cho hóa đơn CSV
trong Gmail đồng bộ thuộc các hồ sơ có yêu cầu mở.

Chạy lại bằng `npm run test:purchase-supplements`.
Xem [biên bản nghiệm thu](VERIFICATION.md).
