# Trả lời đúng luồng và theo dõi đến khi có hồi đáp

Mở **Trả lời** từ một email đến trong Inbox. Compose lấy tài khoản gửi từ email gốc và lấy địa chỉ người nhận từ trường Reply-To có một địa chỉ hợp lệ hoặc địa chỉ người gửi. Hội thoại hiển thị thư thuộc cùng tài khoản theo thứ tự thời gian. Người dùng có thể mở từng nguồn, sửa người nhận và Cc, lưu bản nháp, rồi kiểm tra toàn bộ thư trước khi xác nhận gửi.

## Bản nháp, biên nhận và hồi đáp

- Bản nháp đã lưu nằm ở PostgreSQL và mở lại được từ **Hồi đáp và bản nháp** trong Action Inbox. Việc lưu kiểm tra phiên bản để hai tab không âm thầm ghi đè lẫn nhau. Thay đổi chưa lưu vẫn ở trong trang đang soạn, kèm trạng thái và nhắc trước khi rời trang.
- URL trả lời chỉ mang ID email nguồn. Gợi ý từ trình trợ lý hiện có đi qua bộ nhớ của lần chuyển trang. Người dùng chọn chèn gợi ý trước khi lưu hoặc gửi.
- Xác nhận gửi đóng băng nội dung, nguồn, tài khoản và người nhận cùng một mã yêu cầu. Giao dịch giành quyền gửi kiểm tra lại thư nguồn và nội dung đã duyệt. Nếu chưa rõ kết quả, chức năng kiểm tra trạng thái đọc hoặc đối chiếu Sent bằng cùng mã. Lệnh kiểm tra không thể giành quyền gửi mới.
- Sau khi nhà cung cấp chấp nhận thư, nút **Theo dõi hồi đáp** đưa việc vào **Đang chờ**. Email đến phải cùng tài khoản, có In-Reply-To hoặc References chứa đúng Message-ID của lượt gửi, và có người gửi nằm trong nhóm người nhận đã duyệt. Trạng thái **Có hồi đáp** kèm đoạn trích và email nguồn. Việc theo dõi và đánh dấu đã xem không sửa sổ cam kết.
- Migration tiến áp dụng dữ liệu hội thoại và checkpoint trong cùng giao dịch đồng bộ. Thư lịch sử giữ dữ liệu gốc và chỉ có metadata mới khi nhà cung cấp đưa thư qua lần đồng bộ. Gmail dùng mã hội thoại theo tài khoản. Trường hợp thiếu mã dùng liên kết RFC có sẵn.

## Chạy lại kịch bản

`npm run test:reply-workflow` sử dụng hai hộp Gmail giả lập qua loopback, Chrome, PostgreSQL, GoTrue, PostgREST và bản Next chế độ production trên máy local. Một tài khoản được tạo trước, còn thư cần trả lời thuộc tài khoản thứ hai. Kịch bản giữ dữ liệu của hai tài khoản và máy chủ thư trong lúc khởi động lại Next.

1. Mở thư từ Inbox, thấy lịch sử đúng tài khoản, kiểm tra Reply-To và lưu bản nháp trên desktop. Mở lại cùng nội dung ở phiên trình duyệt mới có viewport mobile.
2. Xem trước và duyệt, sau đó làm mất xác nhận Gmail ở socket và ngắt kết nối trình duyệt. Khởi động lại Next, đối chiếu với Gmail Sent giả lập và thử lại đồng thời cùng biên nhận.
3. Bật theo dõi. Nạp thư trùng tiêu đề và các thư dùng mã tham chiếu ở sai tài khoản hoặc sai người gửi. Nạp hồi đáp đúng, mở email nguồn, rồi phê duyệt riêng thay đổi hạn trong sổ cam kết.
4. Kiểm tra cạnh tranh khi sửa bản nháp, thư nguồn đổi sau phê duyệt, yêu cầu gửi từ sai tài khoản, giới hạn quyền của tenant khác và khách ẩn danh.

[Biên bản chạy](../../test-results/reply-workflow/report.json) · [Số liệu](../../test-results/reply-workflow/workflow.json) · [Mở lại bản nháp trên mobile](../../test-results/reply-workflow/mobile-recovered-draft.png) · [Xem trước khi gửi](../../test-results/reply-workflow/approved-preview.png) · [Hồi đáp trong Action Inbox](../../test-results/reply-workflow/action-inbox-reply.png)

## Phạm vi bằng chứng

Compose cũ lấy tài khoản mặc định theo danh sách tài khoản và giữ dấu vân tay lượt gửi trong phiên tab. Luồng mới kiểm chứng tài khoản theo nguồn, bản nháp đã lưu qua phiên trình duyệt mới và biên nhận qua khởi động lại tiến trình. Chưa đo thời gian thao tác của người dùng.

Kịch bản mới kiểm chứng Gmail giả lập. Luồng SMTP TLS hiện có được kiểm tra qua các bộ hồi quy, còn ca SMTP mất xác nhận vẫn cần bằng chứng đối chiếu từ máy chủ gửi như trước. Kiểm tra responsive dùng trình duyệt desktop, tablet và mobile. Hộp thư thật, thiết bị thật và native shell nằm ngoài phạm vi lần chạy này.

## Hoàn nguyên trong local

Có thể quay lại giao diện trước đó trong khi giữ migration và sổ biên nhận. Bản ghi nháp đã duyệt hoặc chưa rõ kết quả vẫn dùng mã đã lưu để đối chiếu. Việc giữ bảng và biên nhận cho phép bật lại luồng mà không tạo lượt gửi mới cho các bản đã duyệt.

## Kết quả nghiệm thu local

Ngày 12/11/2026, lượt nghiệm thu phục hồi một bản nháp trong phiên mobile mới và ghi nhận một lần gọi gửi, một thư được Gmail giả lập chấp nhận, một biên nhận và một dòng Sent. Máy chủ thư đã nhận thư trước khi socket trả xác nhận bị đóng. Sau khi khởi động lại Next, kiểm tra Sent và ba yêu cầu lặp đồng thời đều quy về cùng biên nhận. Inbox bỏ qua ba thư gây nhiễu, hiển thị đúng hồi đáp và ghi phiên bản cam kết thứ hai sau xác nhận riêng.

Môi trường macOS arm64, Node 24.14.1, Chrome 157.0.8103.52. Lệnh SQL trực tiếp dùng PostgreSQL 16.14. Các lượt trình duyệt build Next ở chế độ production và dùng PostgreSQL 16 trong Docker.

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:reply-workflow` | Exit 0. 23 kiểm tra, 5 ảnh ở 3 viewport, 0 vi phạm axe lấy mẫu, 0 lỗi trang và 0 tràn ngang. |
| `npm run lint` | Exit 0. 0 lỗi, 91 cảnh báo đã có. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0. 241 bài kiểm thử. |
| `npm run test:integration` | Exit 0. 197 bài kiểm thử. |
| `npm run test:db` | Exit 0. 20 nhóm, gồm chống đổi người nhận sau phê duyệt và khớp hồi đáp chỉ có References. |
| `npm run test:design -- --isolated` | Exit 0. 25 kiểm tra. |
| `npm run test:platform -- --isolated` | Exit 0. 19 kiểm tra. |
| `npm run test:e2e` | Exit 0. 41 kiểm tra. |
| `npm run test:commitment-attention` | Exit 0. 22 kiểm tra. |
| `npm run test:inbox-catchup` | Exit 0. 24 kiểm tra. |

Các lượt xác thực có phần trùng nhau giữa những bộ trình duyệt. Các kết quả chi tiết nằm trong [thư mục bằng chứng local](../../test-results/reply-workflow/).

Harness đã tháo các container kiểm thử và xóa PostgreSQL tạm. Đã dọn thư mục build `.next-build`. Docker image prune thu hồi 0 B.
