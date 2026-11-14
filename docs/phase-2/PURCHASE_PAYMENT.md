# Đối soát ba bên trước thanh toán

Theo dõi một bộ chứng từ trên mỗi PO nhiều dòng. Mua hàng duyệt bảng đơn giá
từ nhà cung cấp. Kho ghi số thực nhận qua luồng phiếu nhập hiện có. Kế toán
xem hóa đơn, số kho đã nhận và giá đã duyệt theo từng dòng, rồi ghi quyết
định **Đủ căn cứ thanh toán** khi các dòng trên hóa đơn khớp.

Ở chặng local này các vai do cùng một người kiểm thử thực hiện. Phạm vi
ủy quyền là chủ hồ sơ trong InboxAI. Chưa có phân quyền tách Mua hàng và
Kế toán trong cùng tổ chức. Hành động duyệt chỉ ghi trạng thái nội bộ.

## Chứng từ

Chọn **Bảng giá / hóa đơn** trên tệp đính kèm trong email có mã PO.
Bảng giá ghi đủ các dòng và đúng số đặt. Mã bảng giá bắt đầu bằng `BG-`.
Hóa đơn ghi mã `INV-`. Bản thay thế ghi mã hóa đơn hiện hành ở cột
`replaces`, có thời điểm gửi mới hơn và giữ lịch sử chứng từ cũ.

```csv
po,price_sheet,line,quantity,unit,unit_price,currency
PO-9418,BG-7601,A,100,bộ,12000,VND
PO-9418,BG-7601,B,100,bộ,8000,VND
```

```csv
po,invoice,replaces,line,quantity,unit,unit_price,currency
PO-9418,INV-7602,INV-7601,A,100,bộ,12000,VND
PO-9418,INV-7602,INV-7601,B,100,bộ,8000,VND
```

Dùng CSV UTF-8, tối đa 8 KiB và sáu dòng. Đơn giá là số nguyên VND
trước thuế. Số tính tiền trên mỗi dòng phải nằm trong cả số đặt và số
thực nhận. Mỗi PO dùng một bảng giá cố định và một chuỗi hóa đơn thay
thế. Bản này chưa xử lý nhiều hóa đơn thanh toán từng đợt, điều chỉnh
bảng giá, thuế, công nợ, cấp lệnh thanh toán hoặc ghi vào ERP.

## Nghiệm thu

- Action Inbox đưa hóa đơn đã ghi nhận nhưng chưa khớp hoặc đang chờ duyệt vào danh sách cần chú ý.
- Ask Inbox dùng mã PO để đối chiếu. Các dòng dẫn đúng bảng giá, phiếu nhập và hóa đơn. Bộ lọc mất nguồn cần thiết cho kết quả thiếu chứng cứ.
- Kho bổ sung phần thiếu thì lỗi số lượng biến mất. Lỗi giá vẫn giữ hóa đơn lại cho tới khi ghi nhận đúng hóa đơn thay thế.
- Máy chủ tải lại tệp trước khi duyệt, so dấu nội dung, rồi kiểm tra lại bộ chứng từ trong giao dịch lưu. Khi mất phản hồi, gửi lại cùng khóa trả về quyết định đã ghi.
- Bằng chứng nguồn thay đổi hoặc đính chính kho làm bộ chứng từ lệch sẽ hủy hiệu lực hiển thị của lần duyệt trước. Bản ghi kiểm toán vẫn còn.

Chạy `npm run test:purchase-payment` trên máy có Chrome và Docker local.
Kịch bản đóng bốn vai với hai Gmail loopback. Báo cáo và ảnh nằm trong
`test-results/purchase-payment/`. [Kết quả kiểm tra](VERIFICATION.md).
