# Yêu cầu bổ sung chứng từ và theo dõi đến khi duyệt xong

Phạm vi local, dữ liệu giả lập. Không kết nối hộp thư thật, push hoặc deploy.

## Kết quả cho người dùng

Từ hồ sơ đang chờ Mua hàng bổ sung trong Action Inbox, người dùng soạn
một yêu cầu gửi nhà cung cấp. Bản nháp chứa PO, hóa đơn đang hiệu lực
và nội dung Kế toán yêu cầu. Người dùng sửa, xem trước rồi xác nhận gửi.
Tài khoản gửi và hội thoại lấy từ email hóa đơn thuộc chủ hồ sơ.

Yêu cầu đã gửi liên kết đến đúng bản Sent đã lưu. Người dùng đặt hoặc
dời ngày kiểm tra lại. Đến hẹn, thư nhắc có nguyên nội dung yêu cầu
chứng từ và cần xem trước, xác nhận gửi. Không tự gửi khi đồng hồ đổi ngày.

Một hồi đáp chưa có đủ chứng từ không khép hồ sơ. Người dùng mở được
email hồi đáp và soạn yêu cầu tiếp trên chính email đó. Tiến độ rà tệp,
đối chiếu bản đính chính và bàn giao cho Kế toán dùng lại luồng hiện có.
Chỉ quyết định duyệt hợp lệ của Kế toán mới khép ngoại lệ và ngừng theo dõi.

## Ranh giới triển khai

- `private.purchase_evidence_requests` lưu liên kết hồ sơ, chủ sở hữu,
  phiên bản hóa đơn và bản nháp qua từng vòng yêu cầu. Không cho client
  hay service role đọc/ghi bảng trực tiếp. RPC đọc/tạo dùng `auth.uid()`.
- Tạo lại yêu cầu sau mất phản hồi trả về bản nháp hiện có; không ghi đè
  phần người dùng đã sửa. Một bản nháp ở email nguồn đang do luồng khác
  sử dụng phải được xử lý trước, không bị tự nhận làm yêu cầu hồ sơ.
- Bản nháp, xác nhận gửi, nhận kết quả chưa rõ, đối chiếu Sent, lịch hẹn
  và gửi nhắc dùng lại hệ thống Reply. Không có một hệ thống gửi mới.
- Match hồi đáp phải đúng chủ sở hữu, tài khoản và RFC In-Reply-To hoặc
  References của lượt gửi, từ người nhận đã xác nhận. Trùng tiêu đề hay
  Gmail thread ID ở hộp thư khác không đáp ứng yêu cầu.
- Trước dispatch, yêu cầu/nhắc được khóa theo hồ sơ và kiểm tra hóa đơn
  đang hiệu lực, lượt yêu cầu mới nhất và giai đoạn Mua hàng. Bàn giao,
  thay đổi hóa đơn hoặc đóng hồ sơ chặn lượt gửi cũ. Bằng chứng của lượt
  đã dispatch vẫn được đối chiếu qua receipt; không phát lại để đoán kết quả.
- Khi khép hồ sơ, lịch theo dõi được dừng. Receipt gửi còn `unknown` hoặc
  `dispatching` được giữ và tiếp tục xuất hiện để kiểm tra; không bị xóa
  vì hồ sơ đã khép. Không có thao tác chuyển tiền trong milestone này.
- Tệp từ email tiếp tục là dữ liệu không tin cậy. Gửi yêu cầu không đồng
  nghĩa xác nhận nội dung tệp; nhận phản hồi không đồng nghĩa duyệt hóa đơn.

## Nghiệm thu và phụ thuộc

Phụ thuộc: Reply Workflow + Follow-up, Purchase Focus, Supplements,
Approval Freshness và Supplement Progress. Kịch bản mới chạy cùng
`npm run test:purchase-release`; không thay bốn hồ sơ benchmark đã khóa.

Hồ sơ mới PO-9992 / INV-9092 → INV-9192 dùng hai Gmail giả lập cho
Mua hàng và Kế toán. Các vai người mua, nhà cung cấp, người duyệt và
người ngoài được mô phỏng. Kịch bản đi từ yêu cầu thiếu hạn thanh toán
đến bản đính chính được duyệt, có mất phản hồi khi tạo nháp, khi gửi,
khi nhắc và hai lần khởi động lại Next trong lúc Chrome mất mạng.

Các điều kiện nghiệm thu:

1. Đúng tài khoản, người nhận và hội thoại; mở đúng Sent và email hồi đáp.
2. Mất phản hồi tạo yêu cầu giữ đúng bản nháp đã sửa; chưa xác nhận không gửi.
3. Gửi/nhắc sau mất phản hồi và khởi động lại có một receipt mỗi lượt,
   tổng đúng ba thư: yêu cầu đầu, thư nhắc, yêu cầu bổ sung tiếp.
4. Dời hẹn chưa gửi nhắc trước ngày mới; đến hẹn chỉ xem trước, chờ duyệt.
5. Hồi đáp và tệp thiếu hạn giữ ngoại lệ mở, không đổi sổ hóa đơn.
6. Tạo yêu cầu tiếp trên email hồi đáp, dừng lịch của vòng yêu cầu trước.
7. Chứng từ hợp lệ đi qua xác nhận, bàn giao, duyệt; nguồn và quyết định
   giữ nguyên sau tải lại; không gửi thêm sau bàn giao/khép hồ sơ.
8. Người ngoài và Kế toán không có API đọc/tạo yêu cầu từ hộp thư Mua hàng.
9. Màn desktop, mobile và dialog được kiểm axe và không tràn ngang.

Kết quả chạy, phiên bản môi trường và giới hạn nằm trong
[VERIFICATION.md](VERIFICATION.md). Ảnh và JSON local nằm ở
`test-results/purchase-release/`; chúng là chứng cứ chạy fixture,
không phải bằng chứng Gmail thật, khách hàng thật hay production.

## Rollback local

Migration tiến `20261116010000_purchase_evidence_requests.sql` không sửa
migration đã áp dụng. Nếu cần bỏ thử nghiệm, khôi phục snapshot database
local trước migration và revert các file của milestone. Giữ bản export
fixture cần tái hiện lỗi trước khi reset. Không thao tác database hosted.

Không cần thêm LLM hoặc agent để thực hiện liên kết, phân quyền, ngày hẹn,
đối chiếu receipt và khép trạng thái. Milestone này không cung cấp số đo
mới về chất lượng mô hình hoặc công sức của người dùng thật.
