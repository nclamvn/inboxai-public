# Inbox dẫn việc từ yêu cầu bổ sung đến duyệt xong

Trong **Hộp thư → Cam kết cần chú ý**, mục **Hồ sơ mua hàng cần xử lý**
hiện yêu cầu bổ sung, hóa đơn hiện hành, người gửi yêu cầu và việc kế
tiếp. Mua hàng mở đúng hồ sơ cần bổ sung hoặc bản mới cần bàn giao.
Sau khi bàn giao, Mua hàng thấy đang chờ Kế toán. Kế toán mở thẳng bản
để duyệt và tải chứng từ trong phạm vi được giao.

Nếu có bản mới hơn, Mua hàng thấy cần bàn giao lại. Kế toán thấy bản đã
thay đổi và chỉ còn đường vào kiểm tra hồ sơ cũ. Hóa đơn và hạn trên
mục Inbox lấy từ nguồn được kiểm tra. Mua hàng mở email thuộc quyền
hộp thư của mình. Kế toán dùng đường tải chứng từ đã được giao. Khi
duyệt thành công, mục rời Inbox của cả hai vai và hồ sơ giữ lịch sử.

Inbox ưu tiên việc cần làm trước việc đang chờ, hiển thị tối đa bốn
PO với một mục chính cho mỗi PO. Link bảng công nợ cho phép xem phần
còn lại. Chọn bộ lọc hộp thư chỉ hiển thị hồ sơ Mua hàng thuộc tài
khoản đó. Việc Kế toán được giao xuất hiện ở chế độ tất cả tài khoản
vì chứng từ gốc nằm ở hộp thư Mua hàng được chia sẻ qua bàn giao.

Luồng chỉ đọc trạng thái đã có và dùng lại quy trình xác nhận có phân
quyền. Biến động ngày hạn hoặc phiên bản vẫn được kiểm tra ở bước duyệt.

## Kiểm tra giá trị trên cùng hồ sơ

So sánh trên Chrome với hai Gmail giả lập và cùng trạng thái PO-9422.
Đếm số lần bấm thực tế từ Inbox đã mở đến đúng hóa đơn hoặc hồ sơ duyệt.
Các thao tác bổ sung và phê duyệt sau khi mở giống nhau giữa hai đường.

| Vai | Đường cũ qua Cam kết | Đường trực tiếp từ Inbox |
| --- | ---: | ---: |
| Mua hàng mở đúng hồ sơ cần bổ sung | 3 | 1 |
| Kế toán mở đúng bản bổ sung để duyệt | 3 | 1 |

Đây là số thao tác điều hướng do Chrome thực hiện. Chưa đo thời gian
người dùng thật, mức sử dụng hằng ngày hoặc lợi thế trên hồ sơ khác.
Thay đổi này dùng trạng thái sổ để dẫn việc. Các đối chứng LLM và agent
đã có đo bộ phát hiện cam kết, không dùng để chấm luồng điều hướng này.

Chạy lại bằng `npm run test:purchase-focus`. Xem
[biên bản nghiệm thu](VERIFICATION.md).
