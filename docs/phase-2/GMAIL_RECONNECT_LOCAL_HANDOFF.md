# Khôi phục kết nối Gmail và bắt kịp thư

Inbox hiển thị lần đồng bộ hoàn tất gần nhất của từng tài khoản. Khi Gmail tạm thời không phản hồi, InboxAI giữ thư đã có và thử lại theo nhịp đồng bộ. Khi Gmail từ chối mã làm mới hoặc xác nhận đã mất quyền đọc, Inbox báo **Cần kết nối lại Gmail** cho tài khoản bị ảnh hưởng. Các tài khoản khác vẫn đồng bộ.

**Kết nối lại Gmail** mở màn hình cấp quyền với địa chỉ đã chọn. Callback kiểm tra lại người dùng InboxAI, tài khoản Gmail, danh tính Google đã lưu và phiên bản thông tin xác thực. Chọn nhầm tài khoản không thay đổi thông tin xác thực của bất kỳ hộp thư nào. Cấp lại quyền giữ nguyên mốc đồng bộ và thư đã có. Lượt đồng bộ nền tiếp theo lấy phần còn thiếu, xử lý phản hồi cam kết và giữ đường dẫn đến email nguồn.

**Chờ gửi** hiển thị lý do khi Gmail mất quyền. Thư chưa được gửi giữ nội dung và lịch đã duyệt. Sau khi cấp lại quyền, lịch tiếp tục với cùng mã gửi. Với một lần gửi chưa rõ kết quả, InboxAI tra Gmail Sent bằng mã thư cũ. Nếu Gmail đã từ chối gửi, người dùng có thể hủy lịch để mở bản nháp và quyết định gửi lại.

Chạy nghiệm thu trên Chrome với PostgreSQL, Auth và Gmail giả lập ở loopback:

```sh
npm run test:gmail-reconnect
```

Kịch bản chạy worker đồng bộ và worker gửi thành các tiến trình riêng, khóa mạng của fixture vào loopback và giữ database trong hai lần khởi động lại Next. Dữ liệu thử gồm hai tài khoản, thư đến trong thời gian gián đoạn, hai thư có cùng mã nhà cung cấp ở hai tài khoản, một phản hồi cam kết và một thư lên lịch. Kết quả và ảnh Chrome nằm trong `test-results/gmail-reconnect/`.

Để chạy nền cạnh một ứng dụng local đã cấu hình database giả lập và cùng `CRON_SECRET`:

```sh
INBOXAI_GMAIL_SYNC_URL=http://127.0.0.1:3000 npm run worker:gmail-sync
INBOXAI_SCHEDULED_SEND_URL=http://127.0.0.1:3000 npm run worker:scheduled-send
```

Chạy hai lệnh trong hai terminal. Worker đồng bộ kiểm tra mỗi phút, worker gửi mỗi 10 giây. Dùng `-- --once` để chạy một lượt. Kết quả nghiệm thu áp dụng cho Gmail giả lập tại local.
