# Công nợ cần xử lý

Trong **Cam kết → Công nợ cần xử lý**, Kế toán thấy các đợt hóa đơn đã duyệt
được giao cho mình. Mua hàng thấy các đợt đã bàn giao thuộc PO của mình.
Bảng ưu tiên hồ sơ cần đối soát và khoản mở lại, rồi xếp số dư dương theo
hạn thanh toán. Khoản đã khép rời danh sách. Hạn còn từ một đến bảy ngày
hiện **Sắp đến hạn**. Nhãn đổi theo ngày Việt Nam (UTC+7).

Hạn đến từ cột `payment_due` tùy chọn trên chứng từ hóa đơn, với cùng một
ngày YYYY-MM-DD trên mọi dòng của tệp. Mua hàng và Kế toán thấy ngày này
khi xem trước. Hạn có hiệu lực trên bảng sau khi Kế toán duyệt hồ sơ. CSV
cũ hoặc cột để trống hiện **Chưa xác minh hạn**. Mã PO và ngày giao hàng
vẫn được dùng trong luồng nhập kho.

```csv
po,invoice,replaces,line,quantity,unit,unit_price,currency,payment_due
PO-9418,INV-7804,INV-7803,B,38,bộ,8000,VND,2026-11-18
```

Mỗi đợt chỉ có một mục. Khi bản đính chính đang chờ duyệt hoặc căn cứ
không còn hợp lệ, bảng giữ số dư theo bản đã duyệt với trạng thái **Cần
đối soát lại**, bỏ hạn đã xác minh và ngừng tải hóa đơn cũ từ bảng. Khi
duyệt bản mới, số dư và hạn cập nhật theo bản đó. Người xem mở được email
nguồn theo quyền hộp thư. Với chứng từ được giao, Kế toán tải đúng tệp
hóa đơn đã duyệt qua phạm vi bàn giao và kiểm tra lại dấu vết nguồn.

Số dư là giá trị trước thuế bằng VND từ sổ đã đối soát. Phân trang 40 mục
và làm mới định kỳ khi bảng mở. Luồng lấy chứng từ và xác nhận thanh toán
vẫn nằm ở từng hồ sơ. Bảng chỉ đọc công nợ.

Chạy lại bằng `npm run test:purchase-dues` và `npm run test:db`. Kết quả
được ghi trong [biên bản nghiệm thu](VERIFICATION.md).
