# Lập và duyệt đợt thanh toán

Trong **Cam kết → Công nợ cần xử lý**, Kế toán chọn các hóa đơn đã
duyệt, có hạn xác minh và còn số phải trả. Chọn **Lập đợt thanh toán**
để xem số dư trước thuế bằng VND, hạn và chứng từ từng dòng. Một đợt
tối đa tám hóa đơn. Người duyệt mở **Đợt thanh toán** từ bảng công nợ
để xem đề nghị được giao, tệp hóa đơn và lịch sử xác nhận.

Người lập chỉ chọn được người duyệt đã xác minh và được cấp quyền cho
tài khoản đó. Người lập và chủ PO trong đề nghị không được duyệt
đề nghị. Quyền này được cấp trước vào bảng riêng
`private.purchase_batch_approvers`. Bộ nghiệm thu cấp quyền trong
database giả lập. Giao diện duyệt chỉ dùng các quyền đã cấp.

Khi gửi đề nghị, hệ thống giữ mỗi đợt hóa đơn trong đúng một đợt
thanh toán và khóa phạm vi, hạn, số dư, phiên bản và chứng từ đã xem.
Nếu căn cứ, phiên bản, số dư hoặc quyền duyệt đổi trước khi xác nhận,
người lập hủy đề nghị cũ để giải phóng khoản giữ và lập lại. Bản cũ và
lịch sử vẫn truy được theo quyền. Duyệt đợt chỉ xác nhận đề nghị, số
công nợ giữ nguyên đến khi có chứng từ thanh toán đã ghi sổ.

Kế toán mở tệp CSV trong Gmail và chọn **Đối soát thanh toán** như
luồng cũ. Một tệp ghi một giao dịch cho một hóa đơn. Hệ thống tự gắn
chứng từ vào đúng dòng đang giữ trong đợt đã duyệt. Nhiều chứng từ có
thể hoàn thành một dòng. Đợt chỉ khép khi mọi dòng đã đối chiếu đủ.
Căn cứ gắn vào đợt từ ngày duyệt trở đi theo lịch Việt Nam. Chứng từ
có ngày chuyển khoản sớm hơn cần được đối soát trước khi lập lại đợt.
Có thể mở lại email chứng từ nếu người xem có quyền hộp thư. Người
duyệt xem mã chứng từ, giá trị và tệp hóa đơn trong phạm vi được giao.

Chứng từ hoàn giảm số đã đối chiếu của đợt gốc và hiện trạng thái cần
đối soát. Đợt đã khép vẫn giữ lịch sử và không tự giữ lại số dư vào
đề nghị cũ. Nếu đợt còn giữ khoản nào, Kế toán hủy để giải phóng và
lập đề nghị mới trên số dư hiện hành.

Chạy local bằng `npm run test:purchase-batches` và `npm run test:db`.
Gmail và chứng từ ngân hàng đều là dữ liệu giả lập. Luồng không phát
lệnh chuyển tiền. Xem [biên bản nghiệm thu](VERIFICATION.md).
