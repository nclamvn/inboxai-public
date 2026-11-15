# Dọn Inbox với đồng bộ Gmail hai chiều và hoàn tác

Trong InboxAI, chọn từng thư hoặc nhóm thư để lưu trữ, đưa về Inbox, đổi trạng thái đọc hoặc đổi dấu sao. Tài khoản Gmail đã đồng bộ được xác định bằng tài khoản nguồn và ID thư của Gmail. Mục **Thao tác Gmail gần đây** hiển thị kết quả cho từng thư. **Kiểm tra lại** tiếp tục xử lý các mục đang chờ. Các thay đổi phát sinh ở Gmail đi về InboxAI qua lịch sử đồng bộ hiện có.

InboxAI lưu yêu cầu trước khi ghi nhãn và xác minh bằng lần đọc lại từ Gmail. Nếu mất phản hồi sau khi Gmail đổi nhãn, hệ thống có thể xác minh trạng thái hiện tại từ lần đọc lại. **Hoàn tác** yêu cầu biên nhận cho thay đổi do InboxAI thực hiện và lịch sử thư vẫn khớp. Một thay đổi từ bên ngoài trên cùng thư có thể khiến mục đó bị bỏ qua khi hoàn tác, kể cả khi nhãn cần hoàn tác đã trở về cùng giá trị. Các thư còn đủ điều kiện vẫn được xử lý.

```sh
npm run test:gmail-triage
```

Kịch bản khởi tạo hai tài khoản Gmail giả lập qua loopback, PostgreSQL, GoTrue, PostgREST và Next.js ở chế độ production, rồi điều khiển Chrome bằng Playwright. Một người dùng giả lập riêng dùng để kiểm tra cách ly. Ảnh và kết quả được lưu trong `test-results/gmail-triage/`.

- [Kết quả kiểm tra trình duyệt](../../test-results/gmail-triage/report.json)
- [Kết quả từng thư và số lần ghi Gmail giả lập](../../test-results/gmail-triage/workflow.json)
- [Khôi phục kết quả trên mobile](../../test-results/gmail-triage/01-cho-xac-minh-mobile.png)
- [Hoàn tác khi một thư có xung đột](../../test-results/gmail-triage/02-hoan-tac-mot-phan.png)

`INBOXAI_GMAIL_TRIAGE_ENABLED=1` bật tính năng trong tiến trình kiểm thử. Mã kiểm tra quyền sửa nhãn trong kho thông tin xác thực. Kịch bản cấp quyền giả lập, vì vậy bằng chứng nghiệm thu giới hạn ở fixture local. Luồng cấp quyền sửa nhãn cho tài khoản thật chưa nằm trong bàn giao này. Kiểm tra xung đột dựa trên lần đọc trước khi ghi và xác minh sau khi ghi. Thay đổi từ một ứng dụng khác trong khoảng giữa hai yêu cầu vẫn có thể xảy ra. Có thể tắt cờ tính năng để quay lại luồng local trước đó và giữ lịch sử thao tác trong cơ sở dữ liệu.

## Kiểm thử local ngày 12/11/2026

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:gmail-triage` | 25 kiểm tra trình duyệt và xác thực, gồm build ở chế độ production |
| `npm run lint` và `npm run typecheck` | 0 lỗi, lint có 91 cảnh báo có sẵn |
| `npm run test:unit` và `npm run test:integration` | 241 và 199 kiểm thử |
| `npm run test:db` | 23 kiểm tra SQL, gồm chặn trang đồng bộ cũ ghi đè nhãn mới |
| `npm run test:design -- --isolated` và `npm run test:platform -- --isolated` | 25 và 19 kiểm tra |
| `npm run test:compose-attachments` và `npm run test:e2e` | 21 và 41 kiểm tra |
| `npm run test:staging -- --isolated` | 31 kiểm tra nâng cấp và phục hồi |

Các bộ chạy có thể dùng chung bước xác thực. Môi trường gồm macOS arm64, Node 24.14.1, Next.js 16.4.6, Chrome 157 và PostgreSQL 16. Bài kiểm tra cắt phản hồi của Gmail giả lập và trình duyệt, khởi động lại Next, rồi đọc lại trạng thái trên mobile. Kịch bản xung đột đổi dấu sao từ phía Gmail rồi đổi lại cùng giá trị trước khi hoàn tác. InboxAI phát hiện lịch sử mới hơn và chỉ gửi một lệnh hoàn tác cho thư của tài khoản còn lại.
