# Inbox bắt kịp sau khi vắng mặt

Inbox hiển thị trạng thái từng tài khoản và dẫn tới toàn bộ việc chờ xử lý. Thẻ cam kết trên Inbox ưu tiên phản hồi mới có nguồn. Người dùng có thể mở đúng thư kể cả khi thư nằm ngoài trang Inbox hiện tại, xem đề xuất trước khi ghi sổ, hoặc xác nhận đã kiểm tra một phản hồi chưa chắc chắn và giữ nguyên sổ.

## Hành vi khi gián đoạn

- Giao dịch ghi thư và checkpoint đồng bộ cũng ghi việc chờ phân tích. Một tài khoản mất kết nối giữ checkpoint riêng để tiếp tục. Khởi động lại Next không làm mất thư, việc chờ duyệt hay kết quả đã xác nhận.
- Mỗi lượt kiểm tra xử lý tối đa 160 thư. Worker dùng cùng bộ phát hiện cam kết và chỉ ghi kết quả cho phiên bản nguồn đã đọc. Bản sao từ nhà cung cấp và các cập nhật cờ đọc không tạo thêm mục. Thư bị xóa mất khỏi hàng chờ.
- Phản hồi chờ duyệt gắn với tài khoản, email nguồn và đoạn trích. Đề xuất vẫn dùng giao dịch phê duyệt của Commitment Ledger để kiểm tra quyền, phiên bản và bằng chứng. Xác nhận đã kiểm tra phản hồi không rõ chỉ cập nhật hàng chờ.
- Kết nối lại trình duyệt kích hoạt thử đồng bộ tăng dần. Người dùng cũng có thể chọn **Đồng bộ ngay**. Cả hai đường đều dùng checkpoint và chính sách chờ thử lại hiện có. Phân tích, đồng bộ lại và phê duyệt thay đổi trong sổ không phát lệnh gửi thư.

## Diễn tập lại

Chạy `npm run test:inbox-catchup` trong checkout không có tệp môi trường Next. Kịch bản dùng Chromium, Next ở chế độ production, GoTrue, PostgREST và PostgreSQL local. Hai hộp thư Gmail giả lập chỉ giao tiếp qua loopback. Dữ liệu mô phỏng ba ngày theo thời điểm nhận thư. Kịch bản ngắt mạng trình duyệt, ngắt socket Gmail của một tài khoản, rồi dừng và khởi động lại tiến trình Next trong khi giữ DB và máy chủ thư giả lập.

- [Báo cáo từng kiểm tra](../../test-results/inbox-catchup/report.json)
- [Số liệu và danh sách ảnh](../../test-results/inbox-catchup/workflow.json)
- [Trạng thái gián đoạn](../../test-results/inbox-catchup/account-interruption.png)
- [Danh sách chờ xử lý trên desktop](../../test-results/inbox-catchup/review-desktop.png)
- [Danh sách chờ xử lý trên mobile](../../test-results/inbox-catchup/review-mobile.png)

Kịch bản này đo khả năng phục hồi của luồng sử dụng sản phẩm. Bộ trích xuất cam kết được tái sử dụng. Kết quả sáu phản hồi là kết quả trên bộ dữ liệu giả lập đã định nghĩa. Việc kiểm thử trên hạ tầng Gmail hoặc IMAP thật, native shell và thiết bị thật nằm ngoài lần diễn tập này.

## Nghiệm thu ba ngày giả lập

Lượt cuối ngày 12/11/2026 hoàn thành 24 kiểm tra. Sáu cam kết đã duyệt tạo mốc ban đầu. Hai hộp thư nhận thêm 126 thư khi trình duyệt đóng. Sau mất mạng và khởi động lại Next, hai checkpoint tiếp tục đồng bộ tăng dần và kết quả có đủ 132 thư duy nhất. Cơ sở dữ liệu, phiên đăng nhập và máy chủ Gmail giả lập được giữ khi khởi động lại Next.

Inbox tìm được đủ sáu phản hồi chờ xử lý. Phản hồi quan trọng có 125 thư mới hơn. Trình duyệt mở đúng email nguồn, duyệt một hạn mới, giữ nguyên sổ cho một phản hồi chưa chắc chắn, và kiểm tra phản hồi mâu thuẫn còn được giữ với đúng nguồn. Bốn việc chưa xử lý vẫn còn sau khi tải lại và phát lại dữ liệu từ nhà cung cấp. Kiểm tra qua hai tenant và truy cập ẩn danh từ chối truy cập chéo. Luồng phát sinh 0 lượt gửi qua Gmail hoặc SMTP và 0 bản ghi gửi. Năm ảnh ở ba kích thước trình duyệt có 0 lỗi axe, 0 lỗi trang và 0 tràn ngang.

Phiên demo một ngày cũ trên cổng 57300 đã dừng để dùng lại môi trường biệt lập. Harness đã tháo container kiểm thử. Thư mục build `.next-build` và PID cũ đã được xóa. `docker image prune -f` thu hồi 0 B.

## Kiểm tra hồi quy local

Môi trường macOS arm64, Node 24.14.1, Chrome 157.0.8103.52. Lệnh SQL trực tiếp dùng PostgreSQL 16.14. Các lượt trình duyệt dùng PostgreSQL 16 trong Docker.

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | Exit 0. 91 cảnh báo đã có, 0 lỗi. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0. 241 bài kiểm thử. |
| `npm run test:integration` | Exit 0. 197 bài kiểm thử. |
| `npm run test:db` | Exit 0. 19 nhóm SQL, gồm rollback, phân quyền, từ chối phân tích lỗi thời và phân trang có cùng dấu thời gian. |
| `npm run test:commitment-attention` | Exit 0. 22 kiểm tra, gồm duyệt lời nhắc với SMTP TLS local và chống gửi lặp. |
| `npm run test:design -- --isolated` | Exit 0. 25 kiểm tra. |
| `npm run test:platform -- --isolated` | Exit 0. 19 kiểm tra, gồm ngân sách hiệu năng trình duyệt và fixture 600 thư. |
| `npm run test:e2e` | Exit 0. 41 kiểm tra. |
| `npm run test:inbox-catchup` | Exit 0. 24 kiểm tra và một bản build Next production local. |

Mỗi lượt kiểm thử trình duyệt trên dùng một bản build Next ở chế độ production. Các nhóm kiểm thử có một số bước xác thực dùng chung.
