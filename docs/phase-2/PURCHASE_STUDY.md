# Pilot local · Từ thiếu chứng từ đến duyệt đúng bản

Milestone này kiểm tra một việc của hai vai Mua hàng và Kế toán: từ hồ sơ
đang chờ bổ sung đến quyết định duyệt đúng phiên bản, với hạn thanh toán
và tệp nguồn có thể kiểm tra lại. Hồ sơ đã có PO, đơn giá, phiếu nhập và
yêu cầu bổ sung trước khi tính giờ. Bản thử đo phần rà soát, bàn giao và duyệt lại.

## Mở phiên

- `npm run preview:purchase-study` mở [bàn điều phối](http://127.0.0.1:57343/study).
  Dùng hai hồ sơ Chrome riêng để giữ phiên Mua hàng và Kế toán. Thông tin đăng nhập
  giả lập nằm trong phần **Cách tổ chức phiên**. Đăng nhập hai vai trước khi tính giờ.
  Khi Mua hàng bàn giao, bấm **Cập nhật liên kết bàn giao** rồi mở liên kết
  **Mở hồ sơ Kế toán** trong hồ sơ Chrome của Kế toán.
- Thứ tự mặc định là cách làm hiện tại với bộ B, sau đó InboxAI với bộ A.
  Dừng phiên local và chạy `npm run preview:purchase-study -- --bundle-b`
  để làm ngược: InboxAI với B, rồi cách làm hiện tại với A. Tải báo cáo trước khi
  dừng phần điều phối. Một lần khởi động tạo một phiên mới.
- `npm run test:purchase-study` tự chạy cả hai cách qua Chrome, dùng hai Gmail
  giả lập, Next.js production build và PostgreSQL local. Mở bản thử và chạy
  nghiệm thu lần lượt vì dùng chung cổng bàn điều phối. `-- --bundle-b` ghi
  bằng chứng vào thư mục `study/reverse/`, còn phiên dùng thử ghi vào
  `study/preview/` trong `test-results/local-pilot/`. CI chạy thứ tự mặc định.

## Ba tình huống mỗi bộ

| Tình huống | Việc người dùng phải làm |
| --- | --- |
| Hai tệp cùng tên trong một thư | Kiểm tra mã PO rồi chọn đúng thư và đúng phần đính kèm. |
| Thư cũ được đồng bộ sau thư mới | Đối chiếu thời điểm gửi cùng quan hệ thay thế. Bản cũ không được làm đổi quyết định về bản mới. |
| Đính chính đến khi Kế toán đang xem bản bàn giao | Điều phối viên nạp thư khi bản đầu đã có trên màn hình Kế toán. Mua hàng rà lại, bàn giao bản mới và Kế toán duyệt lại. |

Hai bộ có mã PO, mã hóa đơn và định danh phần đính kèm riêng, với cùng mẫu
nhiễu và quan hệ dữ liệu. Bên đối chứng có bản thư và CSV gốc, có thể tải CSV
để mở bằng công cụ local quen dùng. Bên InboxAI nhận thư qua Gmail giả lập và
đi qua giao diện thật. Báo cáo chấm cả mã hóa đơn, ngày và định danh nguồn.
Phê duyệt InboxAI được đọc từ kết quả đã ghi trong cơ sở dữ liệu. Ở đối chứng,
quyết định được ghi từ form của người làm thử.

## Đo và ra quyết định

1. Đăng nhập hai vai trước khi đo. Giữ cách phân vai và mức hướng dẫn như nhau
   cho cả hai phương án. Ghi mã nhóm ẩn danh, công cụ đối chứng và phiên bản
   trong biên bản ngoài báo cáo tự động.
2. Bấm **Bắt đầu đo** khi có thể bắt tay làm. Tạm dừng khi nghỉ, khi chờ ngoài
   công việc, hoặc khi khởi động lại chỉ để kiểm tra độ bền. Giữ thời gian thực
   cần thiết cho luồng bình thường. Thời gian đo gồm thao tác của cả hai vai
   trên cùng một đồng hồ, nên được hiểu là thời gian xử lý chủ động của hồ sơ.
3. Điều phối viên ghi một lượt **Mở nguồn** mỗi lần mở thư hoặc tệp để kiểm tra,
   một lượt **Cần trợ giúp** mỗi lần cần chỉ dẫn từ bên ngoài hai vai, và một
   lượt **Sửa quyết định** mỗi lần thay kết luận đã lập. Ghi theo cùng cách
   ở cả hai phương án. Các bộ đếm là ghi nhận thủ công.
4. Tải JSON cuối phiên. Đối chiếu ba cặp tình huống theo số hồ sơ đúng, số duyệt
   sai, trung vị thời gian, lượt mở nguồn, trợ giúp và sửa quyết định.
   Phân tích riêng hồ sơ bỏ dở và các phiên có lỗi điều phối.
5. Các ngưỡng đề xuất cho quyết định mở rộng là nhanh hơn ít nhất 25% ở trung vị
   thời gian xử lý, không duyệt sai phiên bản và ít nhất hai nhóm đồng ý dùng
   thử tiếp. Lượt chạy tự động xác minh khả năng vận hành của quy trình đo.
   Thời gian và các lượt bấm trong đó là dữ liệu tự động.

Đối chứng LLM trực tiếp và agent local thật ở lần đánh giá trước dùng bộ hồ sơ
khác. Xem [bản chốt đối soát local](PURCHASE_LOCAL_RELEASE.md). Muốn so sánh
trên hai bộ mới, cần ghi lần chạy, công cụ, chính sách mạng và công rà soát trên
cùng điều kiện cung cấp chứng từ. Bản thử này không gọi model hay Gmail thật.
