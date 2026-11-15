# Điều chỉnh phiếu nhập và mở lại cam kết

## Luồng nghiệm thu

Tài khoản Gmail Mua hàng nhận thông báo từ nhà cung cấp. Tài khoản Gmail Kỹ thuật nhận phiếu từ email kho đã cấu hình. Codex đóng cả ba vai và dùng Chrome để thao tác với ứng dụng local.

1. Nhà cung cấp báo giao 200 bộ. Hai phiếu kho cộng đủ 200 bộ và người mua duyệt khép đơn.
2. Kho gửi `Đính chính DC-6842 cho PN-4832: kho thực nhận 170 bộ.` thay số 180 bộ của phiếu đó. Action Inbox đưa đính chính lên dù đơn đã khép. Bản xem trước dẫn thư đính chính và phiếu gốc, hiển thị tổng đơn từ 200 xuống 190 và trạng thái chuyển sang Đang mở.
3. Sau khi server ghi điều chỉnh, Chrome mất phản hồi. Bấm thử lại trả về cùng phiên bản. Thư gửi lại với cùng mã đính chính, sai người gửi, sai hộp thư và thư đính chính cũ đến muộn đều giữ nguyên sổ.
4. Ask Inbox trả lời vì sao đơn mở lại và dẫn nguồn. Người mua xem trước lời nhắc thiếu 10 bộ, duyệt gửi đến nhà cung cấp qua tài khoản Mua hàng. Phát lại cùng yêu cầu không gửi thêm thư.
5. Kho gửi phiếu mới cho 10 bộ thay thế. Sau khi ghi phiếu, đơn chờ người mua xem các chứng cứ và duyệt khép lần hai. Lịch sử giữ lần khép trước, lần mở lại và lần khép sau.

## Quy tắc và giới hạn

- Đính chính chỉ rõ mã riêng, mã phiếu gốc, số thực nhận sửa lại và đơn vị. Số mới áp cho cả phiếu gốc. Số 0 được hỗ trợ. Luồng hiện dùng một dòng hàng mỗi PO, phiếu dạng văn bản và nguồn kho đã thiết lập.
- Mỗi mã đính chính chỉ có hiệu lực một lần cho mỗi PO. Thời điểm email phải mới hơn phiếu gốc hoặc lần đính chính gần nhất của chính phiếu đó. Đối với lượng thực nhận và trạng thái, thời điểm email khác trong PO không thay thế mốc này.
- PostgreSQL kiểm lại quyền tenant, hộp thư, người gửi, mã PO, nội dung email, trích đoạn, phiên bản và bằng chứng đang còn hiệu lực. Điều chỉnh, phiên bản sổ và biên nhận ghi cùng giao dịch. Phiếu gốc và các phiên bản cũ giữ nguyên. Phiếu bị đính chính vẫn là chứng cứ lịch sử.
- Ask Inbox giữ giới hạn tối đa sáu chứng cứ kho, tính cả phiếu và đính chính. Khi bộ lọc ẩn nguồn cần thiết, email đã thay đổi hoặc vượt giới hạn, Ask Inbox báo chưa đủ chứng cứ. Có thể xem lịch sử dài hơn trong sổ.
- Sổ hỗ trợ tối đa 200 đính chính cho một PO. Milestone chưa xử lý đính chính trong PDF, nhiều dòng hàng, ERP hoặc thay nguồn kho. Các phép tính và ghi sổ xác định theo dữ liệu được duyệt, nên lần này không chạy lại so sánh LLM hoặc đo thời gian người dùng.

## Chạy lại

```sh
npm run test:warehouse-correction
npm run test:db
```

Runner khởi tạo hai Gmail loopback và PostgreSQL biệt lập, dùng build Next production, Chrome desktop và Chrome viewport mobile. Ảnh và báo cáo nằm tại `test-results/warehouse-correction/`. [Kết quả kiểm tra kỹ thuật](VERIFICATION.md#điều-chỉnh-phiếu-nhập-và-mở-lại-cam-kết).
