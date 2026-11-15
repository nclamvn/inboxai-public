# Bàn giao hồ sơ từ Mua hàng sang Kế toán

Trong màn đối soát một hóa đơn đã khớp, Mua hàng nhập email của tài khoản
Kế toán đã xác minh rồi chọn **Bàn giao hồ sơ**. Người được giao mở
**Cam kết → Hồ sơ Kế toán**, xem các dòng của hóa đơn, bảng giá, phiếu kho
và chứng từ đã dùng để tính số cộng dồn. Kế toán có thể duyệt hoặc trả lại
kèm lý do. Mua hàng thấy người trả, lý do và hóa đơn trong lịch sử.

Tài khoản sở hữu PO chọn người duyệt cho từng hóa đơn. Luồng dùng quyền
theo hồ sơ cụ thể và yêu cầu hai tài khoản InboxAI khác nhau. Từ lần bàn
giao đầu tiên, toàn bộ PO dùng quy trình tách quyền duyệt. PO cá nhân chưa
bàn giao tiếp tục dùng quy trình hiện có. Các quyết định cũ vẫn được tính
vào số cộng dồn. Quyền Kế toán theo hồ sơ không cấp quyền truy cập tủ thư,
tệp khác, PO khác hay chỉnh sửa chứng từ của Mua hàng.

Mỗi lần bàn giao có mã riêng và khóa theo tập chứng cứ cùng số lượng đã
duyệt ở thời điểm gửi. Khi Mua hàng ghi chứng từ đính chính, đổi phiếu kho
hoặc phân bổ khác làm đổi số còn lại, lần bàn giao cũ không còn dùng để
duyệt. Mua hàng xem lại hồ sơ và bàn giao lại. Kế toán có thể đọc lịch
sử của hóa đơn đã được giao sau khi xử lý. Quyền xem trích đoạn và tải
tệp qua hồ sơ kết thúc khi lần bàn giao hết hiệu lực.

Phê duyệt kiểm tra lại tệp nguồn rồi PostgreSQL kiểm tra lại quyền,
chứng từ và số cộng dồn dưới khóa của PO. Quyết định và nhật ký ghi cùng
giao dịch. Cùng người duyệt thử lại cùng yêu cầu sẽ nhận biên nhận cũ.
Lịch sử ghi email người bàn giao, người nhận, người trả hoặc duyệt và mã
hóa đơn tương ứng.

## Chạy lại local

```sh
npm run test:purchase-handoff
npm run test:db
```

Kịch bản dùng hai Gmail loopback cho Mua hàng và Kho. Chrome đăng nhập
ba tài khoản InboxAI riêng cho người mua, kế toán và người ngoài hồ sơ.
Đây là quy trình duyệt nội bộ. Không cần gửi thư thông báo hay tài khoản
Gmail thật. [Kết quả và ảnh nghiệm thu](VERIFICATION.md).
