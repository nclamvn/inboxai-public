# Đến hẹn theo dõi hồi đáp

Khi bật **Theo dõi hồi đáp** từ thư đã gửi, người dùng có thể chọn ngày kiểm tra lại theo lịch Việt Nam. Mục **Cần theo dõi hôm nay** trong Action Inbox hiển thị hội thoại đến hẹn hoặc quá hẹn còn chờ hồi đáp. Từ hàng tương ứng, người dùng có thể dời hẹn, ngừng theo dõi hoặc xem trước thư nhắc.

Thư nhắc giữ tài khoản, người nhận và hội thoại của lượt gửi được theo dõi. Sau khi người dùng xác nhận, InboxAI đồng bộ tài khoản gửi, đối chiếu lại lịch và hồi đáp, rồi kiểm tra lần nữa trong giao dịch giành quyền gửi. Một hồi đáp phải cùng tài khoản, đến từ người nhận của lượt gửi và có In-Reply-To hoặc References khớp thư đã gửi hoặc thư nhắc. Nếu đồng bộ chưa xong, InboxAI giữ lịch để người dùng thử lại.

Mỗi lịch hẹn có một mã gửi lưu trong PostgreSQL. Nếu đã giành quyền gửi nhưng kết quả chưa rõ, InboxAI giữ nguyên lịch để tra cứu cùng biên nhận. Với Gmail, việc đối chiếu dùng Message-ID trong Sent. Một lịch mới cần thao tác dời hẹn rõ ràng. Nếu ngừng theo dõi, ngày đã đặt được xóa khỏi lịch hiện hành.

## Nghiệm thu trình duyệt

Chạy `npm run test:reply-followup`. Harness khởi động Next ở chế độ production cùng PostgreSQL, GoTrue, PostgREST và hai tài khoản Gmail giả lập qua loopback. Nó đặt cùng mốc giả lập trong Chromium và hàm lịch riêng của cơ sở dữ liệu thử nghiệm.

- Hội thoại xác nhận mẫu nhận hồi đáp trước hẹn. Action Inbox hiển thị hồi đáp và liên kết nguồn.
- Hội thoại đối chiếu hóa đơn được dời hai ngày. Sau khi khởi động lại, nó xuất hiện đúng mốc mới. Một hồi đáp nạp vào máy chủ thư khi bản xem trước đang mở được tìm thấy lúc xác nhận, nên lượt gửi bị chặn.
- Hội thoại lịch giao linh kiện xuất hiện đúng nửa đêm giờ Việt Nam. Máy chủ giả lập nhận thư nhắc, rồi mất xác nhận ở cả kết nối nhà cung cấp và trình duyệt. Sau khi khởi động lại, màn hình mobile đối chiếu Sent thành công. Ba yêu cầu lặp cùng trả về một biên nhận. Kết quả có đúng một lượt gọi gửi thư nhắc và một dòng Sent. Hồi đáp tham chiếu thư nhắc đưa hội thoại về trạng thái **Có hồi đáp**.

[Báo cáo kiểm thử](../../test-results/reply-followup/report.json) · [Mốc đến hẹn](../../test-results/reply-followup/due-at-vietnam-midnight.png) · [Xem trước thư nhắc](../../test-results/reply-followup/approved-preview.png) · [Đã xác minh trên mobile](../../test-results/reply-followup/recovered-reminder-mobile.png)

## Giới hạn và hoàn nguyên

Bằng chứng mất xác nhận đến từ Gmail giả lập. Lượt gửi SMTP chưa rõ kết quả dùng cơ chế giữ biên nhận hiện có và cần đối chiếu tại máy chủ gửi. Khi hoàn nguyên giao diện local, giữ migration và dữ liệu gửi để tra cứu các biên nhận còn mở. Lịch hẹn và mã đã lưu có thể dùng lại khi bật giao diện trở lại.

## Kiểm tra local

Môi trường macOS arm64, Node 24.14.1, Chrome và PostgreSQL 16. Các lần chạy trình duyệt và staging dùng bản build Next ở chế độ production trên máy local.

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:reply-followup` | 20 kiểm tra đạt, gồm Chromium desktop và mobile. |
| `npm run test:reply-workflow` | 23 kiểm tra đạt. |
| `npm run test:design -- --isolated` | 25 kiểm tra đạt. |
| `npm run test:platform -- --isolated` | 19 kiểm tra đạt. |
| `npm run test:db` | 21 kiểm tra đạt. |
| `npm run test:unit` | 241 bài kiểm thử đạt. |
| `npm run test:integration` | 197 bài kiểm thử đạt. |
| `npm run test:staging -- --isolated` | 31 kiểm tra đạt, gồm nâng cấp, sao lưu và khôi phục. [Báo cáo](../../test-results/staging/run.json) |
| `npm run typecheck` | Exit 0. |
| `npm run lint` | Exit 0, 91 cảnh báo hiện hữu. |

Đã tháo các container kiểm thử và dọn thư mục build `.next-build`. Docker image prune thu hồi 0 B.
