# Theo dõi cam kết giao hàng

## Phạm vi

Nhân viên mua hàng xử lý một PO qua hai hộp thư Gmail, Mua hàng và Kỹ thuật. InboxAI đưa thư cần xem lên Action Inbox. Người dùng mở đúng nguồn, xem phần thay đổi rồi xác nhận. Sổ giữ hạn đã chốt, số lượng nhà cung cấp báo đã giao và các phiên bản có trích dẫn. Ask Inbox đối chiếu các ngày nêu trong thư theo mã PO. Khi quá hạn, lời nhắc chỉ được gửi sau khi người dùng xem trước và duyệt tài khoản gửi, người nhận và nội dung.

Bộ nhận diện hiện dùng các mẫu tiếng Việt hẹp, với một mã PO trong tiêu đề và số nguyên kèm đơn vị. Một đề nghị dời lịch hoặc báo giao từng đợt thiếu số lũy kế được đưa ra để xem. Trường hợp số lũy kế lặp hoặc giảm, nguồn quá cũ, sai người gửi hoặc nội dung trích lại không ghi đè sổ. Báo giao đủ phải khớp tổng và đơn vị đã xác nhận. Với số lượng và hạn giao, RPC cập nhật sổ xác minh chứng cứ và phiên bản trong cùng giao dịch. Xác nhận mất phản hồi dùng lại cùng khóa yêu cầu.

Số lượng phản ánh lời báo của nhà cung cấp trong email. Xác minh hàng đã nhập kho, đối chiếu nhiều dòng của cùng PO, nhiều nhà cung cấp trên cùng mã, hoặc tích hợp ERP nằm ngoài phạm vi kiểm chứng này. Giao diện Ask Inbox trình bày các giá trị tìm được theo email. Hạn đang có hiệu lực được đọc trong sổ cam kết.

## Kịch bản nghiệm thu

- PO-6831 đi từ 200 bộ hạn 15/11 qua đề nghị dời 19/11, báo giao 50 bộ ở hộp thư Kỹ thuật, xác nhận dời hạn rồi báo đủ 200 bộ. Chrome đóng vai người mua hàng, xác nhận từng thay đổi, thử lại sau mất phản hồi lưu, mở thư nguồn và hỏi Ask Inbox.
- Sáu hồ sơ còn lại bổ sung thông báo lặp, sai hạn gốc, người gửi khác, thư đến muộn, sai tổng, giao từng đợt thiếu số lũy kế, thư trích lại và nội dung cố điều khiển AI. Gmail giả lập đồng bộ qua ứng dụng. API mô phỏng quyết định duyệt theo nhãn đã khóa để đo bộ phát hiện.
- Một hồ sơ quá hạn riêng dùng để duyệt và gửi lời nhắc. Hệ thống kiểm tra không có lần gọi gửi trước duyệt, phát lại cùng phê duyệt chỉ có một lần gọi gửi và tài khoản khác không đọc được cam kết.

Bộ đo gồm bảy hồ sơ, 30 thư và 24 sự kiện hoặc quyết định cần xem. `SHA256SUMS` khóa thư và nhãn trước khi sửa bộ phát hiện. Codex soạn cả dữ liệu và nhãn. Điểm đúng yêu cầu khớp email nguồn, thư tạo cam kết, loại sự kiện, các trường tương ứng và trích đoạn nguyên văn. Hai lần đọc cùng dữ liệu vẫn dùng cùng mẫu, nên bộ này đo hồi quy trên các tình huống đã mô tả. Cần bộ thư có cách diễn đạt độc lập để đo khả năng tổng quát.

| Phương án | Khớp nhãn | Kết quả thừa hoặc sai | Thời gian quan sát |
| --- | ---: | ---: | ---: |
| InboxAI | 24/24 | 0 | 9,13 giây |
| Codex mô phỏng đọc thư và nhập bảng | 24/24 | 0 | 1,53 giây |
| LLM trực tiếp | 19/24 | 11 | 71,71 giây |
| Agent đọc thư | 20/24 | 10 | 83,17 giây |

InboxAI đo tổng thời gian tìm đề xuất và xử lý quyết định, gồm thao tác Chrome cho PO-6831 và API cho sáu hồ sơ còn lại. Hai dòng model đo thời gian gọi model theo hồ sơ trên Mac M1 Max 32 GB, chưa cộng công duyệt. LLM trực tiếp dùng 4.593 token vào và 2.455 token ra. Agent dùng 8.749 token vào và 2.584 token ra. Agent đã chọn đọc đủ cả 30 thư. Lần chạy cuối ràng buộc ID nguồn và kiểu trường cho cả hai nhánh model sau khi lần chạy thăm dò bộc lộ lỗi định dạng. Hai nhánh vẫn có thể báo sự kiện lặp, dùng sai hạn gốc hoặc coi nội dung yêu cầu AI làm theo là dữ liệu nghiệp vụ. Kết quả phụ thuộc model, prompt và tập thư đã chọn.

## Chạy lại

```sh
npm run test:delivery-commitments
node tests/eval/commitments/delivery/manual-simulated.mjs
node tests/eval/commitments/delivery/run.mjs
node tests/eval/commitments/delivery/run.mjs compare
```

Kịch bản thứ nhất cần Chrome và Docker local. Kịch bản thứ ba cần model Qwen3-4B-Instruct-2507 Q4_K_M trên llama.cpp b12242 tại `127.0.0.1:57340`, alias `qwen3-4b-m6g`, context 4096, theo [hướng dẫn chuẩn bị model](M6G_LOCAL_HANDOFF.md#tái-lập). Hai phương án dùng cùng model với temperature 0, seed 82, không cache prompt. LLM trực tiếp nhận toàn bộ thư. Agent nhận tiêu đề và metadata, chọn ID trong tập được phép, gọi công cụ đọc một lần rồi phân tích các nội dung trả về. Cả hai xuất đề xuất có cấu trúc và không gọi API ghi sổ hoặc gửi thư.

Mô phỏng đọc thủ công chạy một danh sách thư và bảng theo dõi đơn giản trong Chrome. Codex mở từng thư và nhập quyết định dựng sẵn theo vai người mua. Thời gian thao tác tự động chỉ phục vụ tái lập. Thời gian suy nghĩ, chi phí xử lý của người dùng và khả năng thay thế quy trình hiện tại chưa được đo.

Kết quả, ảnh và log do runner ghi vào `test-results/delivery-commitments/`. [Bảng kiểm chứng kỹ thuật](VERIFICATION.md#theo-dõi-cam-kết-giao-hàng).
