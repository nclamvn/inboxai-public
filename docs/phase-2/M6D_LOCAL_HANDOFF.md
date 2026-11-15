# M6-D kiểm thử hành trình mua hàng trên máy

Trong dự án InboxAI ở Codex, chạy action **Mở bản thử InboxAI** hoặc nhập
`npm run preview:e2e` ở terminal. Khi terminal in địa chỉ, mở [InboxAI local](http://127.0.0.1:55300/login)
trong trình duyệt Codex. Giữ terminal chạy trong lúc thao tác.

| Vai trò giả lập | Email |
| --- | --- |
| Nguyễn Hoàng Mai, phụ trách mua hàng | `mai.nguyen@example.test` |
| Trần Quốc Huy, tổ chức khác | `huy.tran@example.test` |

Hai tài khoản dùng mật khẩu `Synthetic-passphrase-123`. Mai có hộp thư Mua hàng
và Kế toán. Huy chỉ có hồ sơ của tổ chức mình. Các ngày trong đơn mua `PO-731`
được tính từ thời điểm khởi động để đề xuất luôn nằm trong cửa sổ kiểm tra gần đây.
Chọn **Bỏ qua** nếu ứng dụng hiển thị phần giới thiệu lần đầu.

1. **Hộp thư.** Mở phần **Ưu tiên và nguồn** của **Đổi lịch giao [PO-731]**.
   Mở email nguồn để xem yêu cầu xác nhận và lý do kiểm định lại linh kiện.
2. **Cam kết.** Mở **Đề xuất từ email**. Duyệt **Xác nhận lịch giao [PO-731]**
   trước, sau đó duyệt **Đổi lịch giao [PO-731]** để cập nhật chính cam kết đó.
3. **Tìm kiếm.** Nhập `Đối chiếu ngày giao hàng của PO-731?` và chọn **Hỏi email**.
   Kết quả cho thấy hai ngày khác nhau cùng các nguồn từ Mua hàng và Kế toán.
   Mở nguồn **Đổi lịch giao [PO-731]** để đọc lý do nhà cung cấp nêu trong thư.
4. **AI Operator.** Nhập `Lưu trữ thư từ supplier@example.test`, chọn tài khoản
   `smtp-wire@example.test` và xem trước. Bỏ chọn thư xác nhận lịch gốc. Phê duyệt
   phạm vi, thực thi đúng một thư, tải lại để xem xác minh, rồi hoàn tác.
5. **Soạn thư.** Chọn `smtp-wire@example.test`, gửi một xác nhận giả lập tới
   `supplier@example.test` và xem thư đã nhận trong [Mailpit](http://127.0.0.1:55825).
6. **Cách ly.** Đăng xuất và đăng nhập bằng tài khoản Huy. Hộp thư chỉ hiện
   **Hồ sơ riêng [PO-731]**. Liên kết email hoặc kế hoạch của Mai trả về 404.

Để đặt lại dữ liệu, nhấn `Ctrl+C` trong terminal đang chạy bản thử rồi mở lại
action. Cùng bộ dữ liệu được nạp mỗi lần khởi động. Môi trường dùng PostgreSQL
tạm thời, tài khoản Auth giả lập và kết nối SMTP TLS tới máy chủ thử local.

Chọn **Run E2E** hoặc chạy `npm run test:e2e` để chạy tự động, kể cả khi bản thử
đang mở. Playwright dùng ứng dụng tại `127.0.0.1:57300`, dữ liệu trong Docker
project `inboxai-m6d-e2e` và bản build riêng trong `.next-build`. Hệ thống cần
Node, Docker Desktop với các image của fixture có sẵn và Chrome local. Có thể
dùng `INBOXAI_CHROMIUM_PATH` để chỉ định đường dẫn Chromium. Báo cáo nằm ở
`test-results/m6d/report.json`. Nếu lỗi, Playwright lưu ảnh tại
`test-results/m6d/failure.png`.

| Kịch bản tự động | Kết quả cần đạt |
| --- | --- |
| Đăng nhập và xử lý thư ưu tiên | Mai mở đúng email và thấy căn cứ cần phản hồi. |
| Đổi hạn trước khi xác nhận cam kết gốc | Đề xuất không có nút duyệt và sổ cam kết vẫn trống. |
| Xác nhận cam kết gốc rồi xác nhận đổi hạn | Cùng một cam kết tăng đúng một phiên bản và có ngày giao mới. |
| Hỏi về một mã đơn hàng không tồn tại | Ask Inbox báo thiếu bằng chứng và không hiện liên kết nguồn. |
| Đối chiếu ngày giao giữa hai hộp thư | Hiện hai ngày khác nhau cùng các trích dẫn đúng phạm vi. |
| Lọc lại câu hỏi theo hộp thư Kế toán | Chỉ giữ bằng chứng Kế toán cho cùng mã đơn mua. |
| Phê duyệt lưu trữ một thư | Chỉ thư đã chọn được lưu trữ. Tải lại vẫn thấy xác minh. Hoàn tác khôi phục trạng thái ban đầu. |
| Một thư đổi nội dung sau phê duyệt | AI Operator yêu cầu lập kế hoạch mới và không lưu trữ thư nào trong phạm vi đã duyệt. |
| Trình duyệt mất phản hồi sau khi gửi thành công | Thử lại với cùng mã yêu cầu trả về cùng mã thư. Mailpit chỉ nhận một thư. |
| Đăng nhập bằng người dùng tổ chức khác trên màn hình mobile | Chỉ thấy thư của tổ chức mình. API trả về 404 khi mở email hoặc kế hoạch của Mai. |

Thư đến được nạp vào PostgreSQL từ fixture. Ưu tiên, đề xuất cam kết, câu trả lời
theo nguồn và kế hoạch Operator chạy qua ứng dụng local. Kiểm thử M6-D bao phủ
hành trình chính trên desktop và cách ly tổ chức trên viewport mobile. Security
gate cho hộp thư thật và production vẫn đóng.
