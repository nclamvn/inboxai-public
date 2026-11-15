# Đối soát khoản chuyển bị hoàn và mở lại công nợ

Kế toán được giao mở chứng từ trong Gmail, chọn **Thanh toán** ở tệp CSV,
xem mã giao dịch gốc, số tiền bị hoàn và số còn phải trả sau hoàn. Chọn
**Xác nhận ghi hoàn tiền** để ghi một dòng hoàn riêng. Mua hàng thấy số
dư và lý do trên hồ sơ PO. Kế toán có thể mở lại email nguồn trong hộp
thư của mình.

```csv
po,invoice,return,original_transfer,returned_on,amount,currency
PO-9418,INV-7804,RT-78101,BANK-78102,2026-11-12,104000,VND
```

Mỗi tệp UTF-8 có một khoản hoàn VND. Trường `invoice` chỉ bản hóa đơn
đang hiệu lực và đã duyệt. `original_transfer` tham chiếu khoản trả gốc
trên cùng đợt hóa đơn, kể cả khoản ghi cho phiên bản trước. `return` là
mã chứng từ hoàn, dùng để phát hiện chứng từ gửi lại. Tổng các khoản
hoàn của một giao dịch không được vượt số gốc. Ngày hoàn phải từ ngày
chuyển gốc đến ngày hiện tại tại Việt Nam.

Sổ giữ nguyên các khoản trả và ghi số hoàn riêng. Dòng hoàn trỏ về giao
dịch gốc, mang chứng cứ email và thông tin Kế toán ghi nhận. Giá trị
còn phải trả được tính trên số đã chuyển sau khi trừ số hoàn. Công nợ
đã khép chuyển sang **Công nợ mở lại** khi số dư dương do bị hoàn. Kế
toán dùng mẫu thanh toán cũ với mã chuyển mới để ghi khoản thay thế.

Máy chủ đọc lại tệp Gmail và kiểm tra mã chứng từ, số dư, bản hóa đơn
và số đã hoàn trong giao dịch PostgreSQL. Khi mất phản hồi, nút **Thử
lại cùng yêu cầu** dùng lại khóa và nhận cùng biên nhận. Hồ sơ theo
dõi số tiền trước thuế. Quyền truy cập và việc xác nhận áp dụng cho
chứng từ ngân hàng giả lập trong Gmail, với số liệu do Kế toán xác nhận.

## Chạy lại local

```sh
npm run test:purchase-return
npm run test:db
```

Bộ Chrome chạy lại từ lúc bàn giao, duyệt, ghi hai lần thanh toán, rồi
ghi nhận hoàn và khoản chuyển thay thế. Kế toán mở phiên Chrome mới cho
lần ghi khoản thay thế. [Kết quả nghiệm thu](VERIFICATION.md).
