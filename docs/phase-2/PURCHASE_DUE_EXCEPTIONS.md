# Xử lý ngoại lệ công nợ

Kế toán vào **Cam kết → Công nợ cần xử lý**, chọn **Yêu cầu bổ sung
chứng từ** ở hóa đơn thiếu hạn hoặc đang cần đối soát, rồi ghi việc cần
Mua hàng bổ sung. Một đợt hóa đơn chỉ có một ngoại lệ đang mở. Bảng và
hồ sơ cho cả hai vai thấy ngoại lệ đang chờ ai. Phần còn phải trả vẫn
truy được theo bản đã duyệt và hệ thống tạm giữ việc ghi khoản trả mới.

Mua hàng mở email nhà cung cấp và ghi nhận hóa đơn CSV đính chính
thuộc cùng PO và đợt hóa đơn. Mã PO trên tệp phải trùng email, bản đính
chính phải mới hơn bản nó thay thế và trỏ đúng chứng từ đang hiệu lực.
Nếu hóa đơn ban đầu thiếu hạn, bản bàn giao bổ sung phải có cột
`payment_due` hợp lệ. Mua hàng bàn giao bản mới cho đúng Kế toán đã mở
yêu cầu. Kế toán thấy ngày, giá trị trước thuế của hai bản và chứng từ
trong phạm vi được giao. Có thể trả lại kèm lý do để Mua hàng tiếp tục.

Chỉ duyệt bản bổ sung hiện hành mới khép ngoại lệ. Thư đến sau với
chứng từ cũ không thay bản đang hiệu lực. Nếu đã có bản mới hơn trong
lúc duyệt, yêu cầu duyệt cũ bị chặn. Quyết định, trạng thái, nhật ký và
biên nhận đổi trong cùng giao dịch. Sau khi duyệt, bảng dùng hạn và số
dư của bản mới, lịch sử vẫn xem được ở hồ sơ của cả hai vai.

Bản local gồm yêu cầu nội bộ, xử lý hóa đơn CSV và số dư đã đối soát
trước thuế bằng VND. Kế toán phụ trách giữ nguyên trong một ngoại lệ.
Bản này không gửi email ra nhà cung cấp và không thực hiện lệnh chuyển
tiền. Dữ liệu Gmail và chứng từ ngân hàng đều giả lập.

Chạy lại bằng `npm run test:purchase-exceptions` và `npm run test:db`.
Xem [biên bản nghiệm thu](VERIFICATION.md).
