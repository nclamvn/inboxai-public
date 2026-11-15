# Lên lịch gửi thư

InboxAI lưu giờ gửi và nội dung đã duyệt trên server. Trong **Soạn thư**, chọn **Lên lịch gửi**. Với thư trả lời, chọn **Xem trước thư gửi** rồi **Lên lịch gửi**. Hộp thoại hiển thị tài khoản gửi, người nhận, Cc, tiêu đề, nội dung, tệp và giờ theo múi giờ thiết bị. Mở **Chờ gửi** từ thanh điều hướng hoặc đầu trang Soạn thư trên màn hình hẹp.

- **Dời lịch gửi** đổi giờ của cùng yêu cầu. **Hủy lịch gửi** mở lại bản nháp để chỉnh sửa. Cả hai thao tác dùng phiên bản lịch để tránh ghi đè thay đổi ở tab khác. Worker khóa lịch khi bắt đầu xử lý.
- Gmail cần quyền đọc và gửi. InboxAI dùng cùng mã thư để đối chiếu với Gmail Sent khi mất phản hồi. Chỉ khi có biên nhận Gmail, InboxAI mới hiển thị **Đã gửi** và mở được thư đã xác nhận. Nếu chưa có biên nhận, **Kiểm tra Gmail** chỉ tìm lại thư đã gửi.
- Lịch gửi chạy qua Next, PostgreSQL và worker độc lập với trình duyệt. Khi worker hoặc ứng dụng dừng, thời điểm xử lý có thể muộn hơn lịch. Sau khi khởi động lại, worker tiếp tục xử lý lịch đến hạn và kiểm tra lại yêu cầu chưa rõ kết quả. Vòng lặp giới hạn số lần tự thử hoặc đối chiếu.

## Chạy local

```sh
npm run test:scheduled-send
```

Lệnh này dựng PostgreSQL, Auth và PostgREST biệt lập, biên dịch Next ở chế độ production, chạy Google Chrome và hai tài khoản Gmail giả lập. Nó khởi chạy worker bằng tiến trình Node riêng với đồng hồ thử nghiệm. Báo cáo, giờ gửi và ảnh được lưu ở `test-results/scheduled-send/`.

Để chạy worker cạnh một ứng dụng local đã trỏ vào cơ sở dữ liệu giả lập và cấu hình cùng `CRON_SECRET`:

```sh
INBOXAI_SCHEDULED_SEND_URL=http://127.0.0.1:3000 npm run worker:scheduled-send
```

Worker yêu cầu `CRON_SECRET` qua môi trường, chỉ kết nối IP loopback và kiểm tra mỗi 10 giây. Thêm `-- --once` để chạy một lượt. Khi Chrome đóng, Next, PostgreSQL và worker vẫn cần chạy. Milestone này xác minh Gmail giả lập tại local. Khả năng tương thích Gmail thật và lịch chạy trên hạ tầng hosted chưa được kiểm chứng.
