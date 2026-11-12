# Hội thoại trong Hộp thư

Mở một email trong **Hộp thư** hoặc **Đã gửi**, rồi mở **Hội thoại** để xem thư đến và thư đi theo thời gian. Mỗi dòng mở đúng nội dung, tệp và thao tác của thư đó. Tài khoản Gmail và nhãn **Đang xem** cho biết ngữ cảnh hiện tại. Với một thư đã gửi, **Trả lời hội thoại** mở bản soạn từ thư đến mới nhất còn khả dụng trong cùng tài khoản. Hội thoại dài tải từng trang, đồng thời giữ thư đang xem ngay cả khi thư đó cũ hơn trang đầu.

InboxAI ghép theo mã hội thoại Gmail trong phạm vi tài khoản. Khi Gmail chưa đồng bộ metadata của thư vừa gửi, biên nhận đã xác minh nối thư đi với email mà người dùng đã trả lời. Các thư thiếu mã hội thoại dùng quan hệ RFC trực tiếp trong cùng tài khoản khi có bằng chứng. Một mã Gmail khác đã xác định sẽ giữ thư ở hội thoại riêng. Hộp thư và Cam kết tiếp tục mở theo ID của từng email.

Chạy trên Chrome với hai tài khoản Gmail giả lập ở loopback:

```sh
npm run test:inbox-conversation
```

Kịch bản dùng Next ở chế độ production, PostgreSQL, GoTrue và PostgREST local. Nó mở hai luồng có cùng tiêu đề và cùng mã Gmail ở hai tài khoản, đọc cả Hộp thư và Đã gửi, làm mất phản hồi sau khi Gmail nhận thư, khởi động lại Next và đối chiếu Gmail Sent bằng cùng mã gửi. Kịch bản cũng kiểm tra email nguồn cũ và mới từ Cam kết, tải trang hội thoại cũ và từ chối truy cập chéo tenant. Ảnh và báo cáo nằm tại `test-results/inbox-conversation/`.
