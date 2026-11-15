# Gửi, trả lời và chuyển tiếp tệp đính kèm

## Luồng sử dụng

- Soạn thư hoặc trả lời, chọn **Đính kèm tệp**, rồi chọn **Lưu bản nháp**. Mở lại thư đang soạn từ danh sách bản nháp hoặc từ hội thoại gốc để tiếp tục với đúng các tệp đã lưu.
- Chọn **Chuyển tiếp** từ thư gốc. Các tệp nguồn bắt đầu ở trạng thái chưa chọn. Có thể tải từng phần MIME nguồn để đối chiếu trước khi chọn, kể cả khi các tệp cùng tên và dung lượng.
- **Xem trước thư gửi** hiển thị tài khoản, người nhận, nội dung và tệp đã lưu. **Xác nhận gửi** khóa bản duyệt theo phiên bản và dùng biên nhận bền vững của luồng gửi hiện có.
- Khi trạng thái gửi chưa rõ, mở lại bản nháp và chọn **Kiểm tra trạng thái gửi**. Gmail có thể đối chiếu Sent theo Message-ID. SMTP thiếu biên nhận vẫn giữ trạng thái chưa xác minh.
- Mở **Đã gửi**, chọn thư và tải lại tệp. Bản tải lấy đúng nội dung đã đính kèm khi gửi.

Mỗi thư hỗ trợ tối đa 5 tệp và tổng 8 MiB. Tệp rỗng bị từ chối. Nội dung tệp lưu ở schema riêng, xác định bằng ID và SHA-256. Quyền tải bản trong Sent phụ thuộc quyền xem email của người gọi. Bản sao của tệp đã chọn còn dùng được cho luồng gửi khi máy chủ nguồn tạm mất kết nối.

## Chạy lại hoàn toàn local

```sh
npm run test:compose-attachments
```

Kịch bản chạy production-mode Next.js, Chrome qua Playwright, GoTrue, PostgREST, PostgreSQL và hai tài khoản Gmail giả lập qua loopback. Harness tự tạo dữ liệu, chặn trình duyệt gọi các địa chỉ ngoài fixture và tự dừng các dịch vụ test. Ảnh, log và kết quả máy đọc được nằm trong `test-results/compose-attachments/`.

- [Báo cáo kiểm thử](../../test-results/compose-attachments/report.json)
- [Biên nhận gửi và SHA-256 của các tệp tải lại](../../test-results/compose-attachments/workflow.json)
- [Duyệt chuyển tiếp tệp trùng tên](../../test-results/compose-attachments/04-duyet-chuyen-tiep.png)
- [Tệp đính kèm trong Sent](../../test-results/compose-attachments/06-tep-trong-sent.png)

## Kết quả ngày 12/11/2026

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:compose-attachments` | 21 kiểm tra và build production-mode |
| `npm run lint` | 0 lỗi, 91 cảnh báo có sẵn |
| `npm run typecheck` | Hoàn tất với mã thoát 0 |
| `npm run test:unit` và `npm run test:integration` | 241 và 199 kiểm thử |
| `npm run test:db` | 22 kiểm tra SQL trên PostgreSQL 16 |
| `npm run test:reply-workflow` và `npm run test:reply-followup` | 23 và 20 kiểm tra |
| `npm run test:design -- --isolated` và `npm run test:platform -- --isolated` | 25 và 19 kiểm tra |
| `npm run test:e2e` và `npm run test:staging -- --isolated` | 41 và 31 kiểm tra |

Các lệnh trên thoát với mã 0. Một số kiểm tra xác thực được dùng lại giữa các bộ chạy.
Chrome nghiệm thu trên desktop và khôi phục yêu cầu gửi ở viewport mobile. Sent hiển thị
người nhận đã duyệt và trả đúng từng byte của ba tệp sau khi đồng bộ. Thư chuyển tiếp
chỉ phát một lần sau khi cả máy chủ giả lập lẫn trình duyệt mất phản hồi và Next được
khởi động lại. Bộ kiểm tra axe ghi nhận 0 vi phạm trên các màn hình đã chụp.

## Ranh giới nghiệm thu

Kịch bản dùng hai tài khoản Gmail mô phỏng thuộc một người dùng, cộng một người dùng khác để kiểm tra phân quyền. SMTP được kiểm tra ở mức dựng MIME và ghi Sent khi chấp nhận một phần. IMAP được kiểm tra bằng thư MIME tổng hợp có hai tệp cùng tên. Các kiểm tra này chưa đo tương thích nhà cung cấp thật. Luồng hiện lưu blob tải lên trước khi lưu bản nháp. Chính sách dọn các blob không còn được tham chiếu và giới hạn dung lượng theo người dùng còn mở trước khi đưa vào vận hành.

Migration mới bổ sung dữ liệu riêng cho luồng tệp đính kèm và giữ cấu trúc cũ của thư đã gửi. Nếu cần quay lại bản ứng dụng trước, giữ migration và dữ liệu để bảo toàn tệp đã lưu. Bản ứng dụng trước cần phiên bản mới để mở lại các bản nháp tệp riêng.
