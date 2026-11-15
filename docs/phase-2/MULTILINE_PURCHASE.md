# Đối soát đơn mua hàng nhiều dòng

Phạm vi local. Người mua theo dõi riêng số đặt, số nhà cung cấp báo giao lũy kế
và số kho thực nhận cho từng mã dòng. Một dòng thừa không bù cho dòng thiếu.
Chỉ người mua mới duyệt từng thay đổi và khép đơn sau khi cả ba số khớp ở
mọi dòng.

## Luồng nghiệm thu

- Nhà cung cấp gửi PO có A 100 bộ và B 100 bộ, rồi báo giao đủ từng dòng
  vào Gmail Mua hàng. Người mua duyệt đơn và gắn Gmail Kỹ thuật với địa chỉ kho.
- Kho gửi cùng một phiếu có A 110 và B 90. Mất phản hồi HTTP sau khi lưu B,
  người mua thử lại và nhận đúng biên nhận cũ. Đơn vẫn mở dù tổng là 200.
- Phiếu không có mã dòng, mã mơ hồ hoặc bản sao của cùng dòng không làm thay
  đổi sổ. Action Inbox hiển thị A thừa 10, B thiếu 10. Lời nhắc chỉ hỏi B
  và chỉ gửi từ Mua hàng sau phê duyệt.
- Ask Inbox dẫn nguồn đặt hàng, báo giao và phiếu nhận theo từng dòng.
  Câu trả lời không đưa ra số liệu khi bộ lọc loại bỏ chứng cứ cần thiết.
- Kho đính chính A về 100. Phiếu B 10 bộ đồng bộ muộn được cộng đúng dòng
  sau phê duyệt. Người mua xem nguồn trên Chrome mobile và khép đơn.
- Tài khoản người dùng thứ hai không duyệt được hay đọc được dữ liệu của người mua.

## Hợp đồng lưu và phạm vi hỗ trợ

Mỗi bản ghi nghiệp vụ mang mã PO ở tiêu đề, mã dòng và đơn vị rõ ràng trong
thân thư. Mail chứa tối đa sáu dòng ghi nhận. Mỗi dòng có một đề xuất để
duyệt độc lập. Hệ thống nhận dạng mẫu email rõ ràng, chưa đọc bảng, PDF,
ảnh hoặc nhiều cách diễn đạt tùy ý. Dùng tiêu đề mang mã như
`[PO-9418] Xác nhận đơn`. Dưới đây là trích đoạn từ các email khác nhau:

```text
Đơn mua hàng nhiều dòng, hạn 2026-11-20: A 100 bộ + B 100 bộ.
Báo giao dòng A: 100 bộ.
Phiếu nhập PN-7111 dòng A: kho thực nhận 110 bộ.
Đính chính DC-7201 cho PN-7111 dòng A: kho thực nhận 100 bộ.
```

Đơn có 2–6 dòng. Một số phiếu được dùng cho nhiều dòng nhưng chỉ được ghi
một lần cho cùng PO và dòng. Báo giao là số lũy kế tăng theo thời điểm
nguồn. Phiếu nhập là số cộng thêm. Đính chính thay số của phiếu gốc trên
đúng dòng và tự mở lại đơn nếu đơn đã khép. Phiếu nhận đến muộn vẫn hợp
lệ nếu thuộc PO, xuất hiện sau email tạo đơn và chưa ghi nhận. Thư đến
muộn không thay thế báo giao mới hơn hoặc đính chính đã được duyệt.

PostgreSQL kiểm tra người dùng, đúng hộp thư và người gửi, nội dung email
nguồn, phiên bản sổ và khóa yêu cầu trong cùng giao dịch lưu. Sổ tiếp tục
dùng bảng Commitment Ledger và lưu chỉ mục sự kiện riêng. Khi khép, máy
chủ kiểm tra lại toàn bộ chứng cứ. Xem các thư đã duyệt trong lịch sử.
Ask Inbox tổng hợp từ sổ và chứng cứ trong phạm vi tìm kiếm, tối đa 16
sự kiện nguồn. Mỗi đơn có tối đa 120 sự kiện được ghi từ email.

Đây là đối soát theo quy tắc xác định với mẫu email giả lập. Chưa đo
chất lượng trên thư tự do, chưa đo thời gian tiết kiệm so với LLM hoặc
agent và chưa xác minh Gmail thật, WMS, ERP hay production.

Chạy lại bằng `npm run test:multiline-purchase` (Google Chrome đã cài,
Docker local và cổng loopback của harness). Báo cáo và ảnh nằm trong
`test-results/multiline-purchase/`. Kiểm tra giao dịch độc lập bằng
`npm run test:db`.

[Kết quả kiểm tra kỹ thuật](VERIFICATION.md#đối-soát-đơn-mua-hàng-nhiều-dòng).
