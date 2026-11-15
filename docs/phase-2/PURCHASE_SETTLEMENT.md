# Đối soát thanh toán và khép công nợ

Kế toán đã duyệt hóa đơn mở tệp trong Gmail của mình, chọn **Thanh toán**,
đối chiếu số đã ghi, khoản trong chứng từ và số còn lại, rồi chọn
**Xác nhận ghi thanh toán**. **Cam kết → Hồ sơ Kế toán** hiển thị số dư,
lịch sử và liên kết về email nếu người xem có quyền hộp thư đó. Mua hàng
xem được số dư và thông tin chứng từ trên màn đối soát PO của mình.

Mỗi tệp UTF-8 từ Gmail chứa một giao dịch. Định dạng thử nghiệm dùng số
tiền nguyên VND, ngày lịch Việt Nam và mã giao dịch duy nhất từ nguồn.

```csv
po,invoice,transfer,paid_on,amount,currency
PO-9418,INV-7803,BANK-78101,2026-11-09,200000,VND
```

Sổ ghi số tiền trước thuế từ hóa đơn đã được duyệt trong luồng bàn giao.
Kế toán xác nhận nội dung chứng từ từ hộp thư của mình. Mã giao dịch được
kiểm tra trùng trong phạm vi Mua hàng và Kế toán, kể cả tệp đổi tên, và
mỗi chứng từ chỉ được ghi một lần. Số dư và phiên bản hóa đơn được kiểm
tra lại dưới khóa của PO, cùng giao dịch ghi sổ và lưu biên nhận. Nếu
phản hồi bị mất, thử lại ngay trên màn hình dùng đúng yêu cầu cũ.

Bản đính chính giữ các khoản từng ghi nhận cho đợt hóa đơn. Chứng từ cho
bản cũ bị chặn. Số còn lại được tính lại khi Kế toán duyệt bản mới. Hệ
thống chuyển sang **Cần đối soát lại** nếu căn cứ thay đổi hoặc đã ghi
nhiều hơn giá trị chứng từ. Quy trình local này theo dõi khoản trước
thuế, với chứng từ do Kế toán xác nhận. Luồng nhận chứng từ khoản chuyển
bị hoàn được mô tả trong [Đối soát khoản chuyển bị hoàn](PURCHASE_RETURN.md).
Thuế, một giao dịch phân bổ trên nhiều hóa đơn và xác thực trực tiếp với
ngân hàng nằm ngoài phạm vi.

## Chạy lại local

```sh
npm run test:purchase-settlement
npm run test:db
```

Dùng hai Gmail loopback cho Mua hàng và Kế toán. Email của Kho vào hộp
thư Mua hàng giả lập. Ba phiên Chrome đăng nhập độc lập với vai Mua
hàng, Kế toán và người ngoài. [Kết quả nghiệm thu](VERIFICATION.md).
