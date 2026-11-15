# Đối soát nhiều hóa đơn theo đợt trên cùng một PO

Mua hàng ghi nhận mỗi hóa đơn gốc từ email của nhà cung cấp. Kế toán mở
đúng hóa đơn từ Action Inbox hoặc lịch sử của PO. Màn đối soát trình bày
số đã duyệt, số còn có thể duyệt và phần đã duyệt vượt theo từng dòng PO.
Ask Inbox dẫn đến bảng giá, phiếu kho, hóa đơn đang xét và các hóa đơn đã
duyệt góp vào số cộng dồn.

## Mỗi đợt giữ lịch sử riêng

Đăng ký nhiều hóa đơn gốc trên cùng PO qua mẫu CSV hiện có. Mỗi số hóa đơn
chỉ được ghi một lần trên PO. Một bản đính chính ghi số hóa đơn đang hiệu
lực của chính đợt đó ở cột `replaces`. Một chứng từ cũ chỉ có một bản
thay thế trực tiếp. Đính chính đến trước chứng từ được thay hoặc có thời
điểm gửi không mới hơn cần xem xét lại.

Số có thể duyệt cho một hóa đơn bằng mức thấp hơn giữa số đặt và số kho
thực nhận, trừ số đã duyệt ở các đợt khác. Các dòng vẫn phải khớp đơn
giá. Một đợt đã duyệt tiếp tục giữ số lượng cũ khi bản thay thế đang
chờ. Lần duyệt bản thay thế cập nhật phần của đợt đó trong cùng giao
dịch. Phiếu kho giảm số thực nhận sẽ báo phần vượt. Các quyết định trước
đó vẫn được lưu để đối chiếu và vẫn được tính vào số đã duyệt cho đến
khi có bản thay thế được duyệt.

Khi lưu, PostgreSQL khóa cùng mã PO với luồng duyệt phiếu kho, đọc lại
tổng số lượng và bằng chứng rồi mới ghi. Thử lại cùng khóa sau khi mất
phản hồi trả chính quyết định cũ. Migrations giữ chuỗi hóa đơn và lượng
đã duyệt của hồ sơ tồn tại từ trước.

## Phạm vi và nghiệm thu

CSV dùng đơn giá VND trước thuế và vai chủ hồ sơ mô phỏng kế toán.
Giới hạn hiện tại là sáu dòng mỗi chứng từ, 32 chứng từ bảng giá và hóa đơn
mỗi PO, và 16 nguồn PO/kho trong một lần đối chiếu. Quyết định chỉ được
ghi trong InboxAI.

Chạy `npm run test:purchase-installments` với Chrome và Docker local.
Hai Gmail loopback mô phỏng Mua hàng và Kho. Nhà cung cấp gửi hóa đơn
60 và 50 bộ khi kho mới nhận 90. Sau khi duyệt 60, chỉ còn 30 có thể
duyệt. Kho bổ sung 10, hóa đơn 50 vẫn vượt 10. Bản thay thế 40 giúp
tổng đã duyệt về đúng 100 sau khi thử lại do mất phản hồi. Kịch bản
còn kiểm tra phiếu giảm sau duyệt, giữ phần cũ khi chờ đính chính và
hai yêu cầu duyệt đồng thời. [Kết quả kỹ thuật](VERIFICATION.md).
