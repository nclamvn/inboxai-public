# Đối soát giao hàng và xác nhận nhập kho

## Luồng người mua hàng

1. Mở cam kết giao hàng theo mã PO. Trong **Đối soát nhập kho**, chọn hộp thư nhận phiếu và nhập email đã biết của kho. Phạm vi nguồn được cố định theo cam kết. Nếu đang theo dõi một PO đã khép theo báo giao, thao tác bật đối soát mở lại PO để kiểm chứng thực nhận.
2. Duyệt báo giao của nhà cung cấp và từng phiếu kho. Cam kết hiển thị số báo giao, số thực nhận và số còn thiếu theo đơn. Khi có phiếu thực nhận thấp hơn số báo giao, Action Inbox đưa chênh lệch lên cùng email nguồn.
3. Xem trước lời nhắc thiếu hàng. Gửi sau khi duyệt tài khoản gửi, người nhận và nội dung. Biên nhận gửi được gắn với phiên bản cam kết.
4. Hỏi Ask Inbox “Kho thực nhận và còn thiếu bao nhiêu cho PO-9418?”. Câu trả lời dựa trên báo giao và các phiếu đã duyệt. Nếu bộ lọc hoặc thay đổi email làm mất một nguồn cần thiết, Ask Inbox báo thiếu chứng cứ.
5. Khi số đặt, báo giao và thực nhận bằng nhau, mở bản xem trước có các email liên quan rồi xác nhận khép. Những phiếu đã duyệt vẫn có trong lịch sử sau khi khép.

## Quy tắc nghiệp vụ

- Một PO tương ứng một dòng hàng, một nguồn kho đã cấu hình và một đơn vị. Kịch bản dùng phiếu văn bản trong email. Các mẫu được nhận diện gồm `Biên nhận PN-4832 – thực nhập 180 bộ.` và `Phiếu nhập PN-4810: kho đã nhận 20 bộ.`.
- Mã phiếu chỉ được cộng một lần trong một PO. Phiếu mới có thể đến sau một phiếu mang thời điểm mới hơn. Ngày của email nguồn phải từ thời điểm hình thành cam kết, và từng phiếu chỉ đóng góp số lượng riêng của nó.
- RPC xác minh tenant, email nguồn đang còn hiệu lực, hộp thư, người gửi, PO, trích đoạn, phiên bản và số lượng. Khóa giao dịch và khóa duy nhất của mã phiếu bảo vệ cả lần duyệt đồng thời. Cùng mã yêu cầu và nội dung trả về biên nhận đã ghi.
- Người mua xác nhận danh tính nguồn kho bằng hộp thư và địa chỉ người gửi mà họ biết. Kịch bản không chứng minh xác thực vật lý hàng hóa hoặc chống giả mạo ở phía nhà cung cấp email. Chưa xử lý PDF, ERP, nhiều dòng hàng, đổi nguồn kho hay điều chỉnh phiếu đã duyệt.
- Luồng ghi sổ hỗ trợ tối đa 200 phiếu mỗi PO. Ask Inbox trả lời tổng khi dẫn được toàn bộ nguồn trong phạm vi tối đa sáu phiếu kho. Sổ cam kết vẫn cho xem lịch sử có phân trang.

## Chạy lại

`npm run test:warehouse-reconciliation` tạo hai Gmail loopback và một PostgreSQL biệt lập, chạy ứng dụng với build Next production và đóng vai người mua trên Chrome. Nhà cung cấp và kho gửi thư giả lập qua API Gmail loopback. Hai phản hồi lưu bị chặn sau khi server đã ghi dữ liệu, ở bước duyệt phiếu đầu và bước khép. Mỗi bước thử lại với đúng mã yêu cầu và trả về cùng phiên bản. Bốn ảnh và báo cáo chạy được ghi ở `test-results/warehouse-reconciliation/`.

`npm run test:db` kiểm tra đường gọi RPC độc lập với UI, bao gồm từ chối chốt thiếu, ngăn sửa trực tiếp số thực nhận, kiểm tra nguồn bị sửa và cách ly tenant. Milestone mở rộng quy trình xác nhận và đối soát số lượng có cấu trúc, dùng mã xác định để tính tổng. Lần này không đánh giá lại LLM hoặc đo thời gian người dùng. [Đối chứng của milestone nhận diện báo giao](DELIVERY_COMMITMENTS.md) vẫn là bằng chứng riêng.
