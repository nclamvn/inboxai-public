# Đối soát phiếu nhập từ tệp CSV đính kèm

Từ email Gmail có mã PO, chọn **Đối soát CSV** trên tệp cần kiểm tra. Màn xem
trước hiển thị hộp thư, người gửi, tên tệp, số dòng trong CSV và số lượng
trước và sau duyệt. Một lần duyệt ghi cả phiếu vào một phiên bản của
Commitment Ledger. Phiếu có dòng lỗi sẽ chờ xác minh cho đến khi kho gửi
lại chứng từ hợp lệ.

## Định dạng

CSV dùng UTF-8, có thể có BOM, xuống dòng LF hoặc CRLF và tối đa 8 KiB.
Tệp có một hàng tiêu đề và 1–6 hàng dữ liệu. Tiêu đề email chứa một mã PO
đã có trong sổ. Email đến từ địa chỉ kho và hộp thư đã thiết lập trên PO.

```csv
po,document,corrects,line,quantity,unit
PO-9418,PN-7300,,A,110,bộ
PO-9418,PN-7300,,B,90,bộ
```

Mỗi phiếu chứa một mã PO và một mã chứng từ. Mã dòng và đơn vị phải
khớp đơn. Số lượng là số nguyên. Phiếu nhập dùng mã `PN-` và số lượng
dương. Phiếu đính chính dùng mã `DC-` và ghi mã phiếu nhập CSV gốc ở
`corrects`. Số mới thay số đã ghi của đúng dòng trên phiếu gốc, có thể
bằng 0. Phiếu đến muộn vẫn được ghi nếu hợp lệ và chưa ghi nhận. Một
đính chính cũ không thay đính chính mới hơn đã ghi.

Trong phạm vi này, CSV dùng các cột và giá trị ở trên. Các ô có thể được
bao bằng dấu ngoặc kép. CSV nhiều PO, trường tự do có dấu phẩy, XLSX, PDF,
OCR và ghi dữ liệu vào ERP nằm ngoài phạm vi.

## Lưu và kiểm tra chứng cứ

Luồng đọc dùng danh tính email và MIME part từ Gmail của người dùng.
Máy chủ tải lại tệp trước khi duyệt. PostgreSQL kiểm tra hộp thư, người
gửi, thời điểm, phiên bản, SHA-256 của tệp và tính hợp lệ của tất cả các
dòng. Một giao dịch lưu phiếu, lịch sử dòng và biên nhận chống lặp. Cùng mã
phiếu dưới tên tệp khác bị từ chối, kể cả khi lần ghi trước đến từ nội dung
email. Thử lại cùng yêu cầu sau mất phản hồi đọc được biên nhận đã lưu.

Ask Inbox và lịch sử dẫn về email và đúng số dòng trong chứng từ. Link
tệp kiểm lại SHA-256 trước khi tải xuống. Ask Inbox dựa trên các dòng đã
ghi cùng quyền xem và trạng thái nguồn đồng bộ hiện tại. Nếu bộ lọc loại
mất một chứng cứ, hoặc email hay tệp thay đổi trong dữ liệu đồng bộ, Ask
báo thiếu chứng cứ. Giới hạn hiện tại vẫn là 16 nguồn cho câu trả lời.
Các dòng đã ghi là bản trích của chứng từ được duyệt. Bản đầy đủ vẫn ở
Gmail của người dùng.

## Chạy lại

```sh
npm run test:purchase-csv
npm run test:db
```

Chrome đóng vai Mua hàng, nhà cung cấp và Kho trên hai Gmail loopback.
Báo cáo và ảnh ở `test-results/purchase-csv/`. [Kết quả kiểm tra](VERIFICATION.md).
