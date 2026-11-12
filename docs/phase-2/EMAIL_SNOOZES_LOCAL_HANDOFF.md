# Hẹn xử lý thư

Trong Inbox, mở menu của thư hoặc menu **Thao tác khác** ở màn hình đọc và chọn **Hẹn xử lý**. Ngày giờ nhập theo múi giờ đang dùng trên trình duyệt. Mục **Đã hẹn** hiển thị giờ và tài khoản của từng thư, với các nút **Dời hẹn** và **Hủy hẹn**. Hủy hẹn đưa thư còn thuộc Inbox trở lại danh sách ngay.

Cơ sở dữ liệu quyết định thời điểm đến hạn. Inbox đang mở đặt bộ hẹn theo mốc gần nhất và tải lại khi đến hạn. Thư trở lại theo giờ hẹn kể cả khi ngày nhận nằm ngoài trang đầu. Khi tab quay lại hoặc kết nối được khôi phục, Inbox đối chiếu giờ và trạng thái mới nhất. Gmail vẫn quyết định trạng thái thư đã lưu trữ hay bị xóa. Lịch hẹn lưu ở InboxAI và không phát sinh thao tác ghi nhãn hoặc gửi thư.

Lịch sử yêu cầu và phiên bản lịch giúp thử lại sau khi mất phản hồi. Một lần dời hoặc hủy dựa trên phiên bản cũ sẽ bị từ chối. Tắt phiên bản giao diện mới có thể giữ dữ liệu lịch hẹn và biên nhận trong cơ sở dữ liệu để phục hồi khi bật lại.

```sh
npm run test:email-snoozes
```

Kịch bản chạy Chrome, Next.js ở chế độ production, PostgreSQL và hai tài khoản Gmail giả lập qua loopback. Chỉ cơ sở dữ liệu kiểm thử dùng hàm giờ thay thế. Dữ liệu gồm hai thư có cùng tiêu đề và ID nhà cung cấp, cùng 52 thư mới hơn thư được chọn để kiểm tra việc đưa thư cũ lên trang đầu.

- [Báo cáo kiểm thử](../../test-results/email-snoozes/report.json)
- [Mốc giờ và trạng thái cuối](../../test-results/email-snoozes/workflow.json)
- [Hai tài khoản trong Đã hẹn](../../test-results/email-snoozes/01-hai-tai-khoan-da-hen.png)
- [Khôi phục lịch sau mất kết nối](../../test-results/email-snoozes/02-khoi-phuc-lich-mobile.png)
- [Thư xuất hiện đúng giờ](../../test-results/email-snoozes/03-thu-tro-lai-dung-han.png)

Bằng chứng áp dụng cho luồng local. Việc hiển thị tự động diễn ra khi trình duyệt đang chạy. Khi trình duyệt đóng hoặc tab bị tạm ngưng, lần mở lại đọc trạng thái theo giờ cơ sở dữ liệu.

## Kiểm tra local ngày 12/11/2026

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:email-snoozes` | 20 kiểm tra Chrome và xác thực, gồm build ở chế độ production |
| `npm run lint` và `npm run typecheck` | 0 lỗi, lint có 91 cảnh báo có sẵn |
| `npm run test:unit` và `npm run test:integration` | 241 và 199 kiểm thử |
| `npm run test:db` | 24 kiểm tra SQL, gồm phiên bản cũ, yêu cầu lặp và đúng mốc đến hạn |
| `npm run test:design -- --isolated` và `npm run test:platform -- --isolated` | 25 và 19 kiểm tra |
| `npm run test:gmail-triage` và `npm run test:e2e` | 25 và 41 kiểm tra |
| `npm run test:staging -- --isolated` | 31 kiểm tra nâng cấp, sao lưu và phục hồi |

Các lệnh đều thoát với mã 0. Môi trường gồm macOS arm64, Node 24.14.1, Next.js 16.4.6, Chrome 157 và PostgreSQL 16. Đã dọn thư mục build biệt lập và các container kiểm thử. Docker image prune thu hồi 0 B.
