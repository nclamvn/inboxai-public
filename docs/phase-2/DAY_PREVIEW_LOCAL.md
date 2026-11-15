# Một ngày trong InboxAI

Mở [trang kịch bản](http://127.0.0.1:57342/) và giữ tab này trong lúc làm việc
ở [InboxAI](http://localhost:57300/inbox). Các liên kết của kịch bản dùng lại
cùng một tab InboxAI. Nếu cần đăng nhập, phần cuối trang có tài khoản giả lập
của Nguyễn Hoàng Mai.

| Giờ mô phỏng | Thao tác trong ứng dụng |
| --- | --- |
| 08:30 | Mở nguồn của cam kết quá hạn VT-78416, xem trước và duyệt lời nhắc. Có thể xem thư ở Mailpit. |
| 10:15 | Nạp phản hồi chưa chốt lịch, đọc nguyên văn và kiểm tra hạn hiện hành. |
| 13:30 | Nạp thư xác nhận, hỏi Ask Inbox về ngày giao và mở nguồn từ hai hộp thư. Duyệt hạn mới trong sổ cam kết. |
| 16:45 | Nạp thư ký nhận và xác nhận hoàn tất. AI Operator lập kế hoạch lưu trữ thư của đơn vị đặt xe, duyệt phạm vi, thực thi, xác minh và hoàn tác. |

Trang kịch bản chỉ nạp thư giả lập theo thứ tự. Phê duyệt và thao tác chạy
qua API InboxAI. Lời nhắc đi qua SMTP TLS tới Mailpit tại cổng 57825.
Cổng 57300 dùng tên `localhost` để phiên đăng nhập giả lập của kịch bản
riêng với bản preview cũ ở `127.0.0.1:55300`.

Chạy `npm run preview:day` để nạp một ngày mới. Dừng phiên preview đó trước khi
chạy `npm run test:day` vì hai lệnh dùng cùng môi trường cô lập. Phiên chạy
tự động lưu kết quả và ảnh vào `test-results/day-preview/`.

Ngày 12/11/2026, `npm run test:day` thoát 0 với 20 kiểm tra, gồm build ở
production mode local, phê duyệt lời nhắc, đối chiếu hai hộp thư, lịch sử
cam kết và hoàn tác AI Operator. Trang kịch bản có kết quả axe lấy mẫu trên
desktop và mobile. Lint thoát 0 với 91 cảnh báo hiện hữu, TypeScript qua,
241 unit test và 197 integration test qua. [Kết quả](../../test-results/day-preview/report.json)

Phiên để xem lưu PID tại `test-results/day-preview/preview.pid`. Giữ
`.next-build` đang phục vụ phiên này. Dừng tiến trình preview khi cần giải
phóng cổng và nạp lại dữ liệu.
