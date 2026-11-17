# Bản dùng thử local liền mạch

Phạm vi: desktop/mobile web trên Chrome, dữ liệu giả lập, không push/deploy,
không kết nối Google thật và không gửi email ra ngoài. Đây là bản dùng thử
tương tác chạy các màn và API hiện có, không phải giao diện dựng ảnh.

## Mở bản thử

```sh
npm run preview:local
```

Lệnh kiểm tra dung lượng trống (ít nhất 10 GiB), từ chối checkout có `.env`
của môi trường khác và các cổng đang bận. Chỉ dùng Docker context có Unix
socket local. Trên macOS, lệnh khởi động Docker nếu cần, chờ có giới hạn,
tải các image fixture còn thiếu rồi build mới bằng `.next`. Không dùng
build cũ còn trên đĩa. Không cài thêm dependency hoặc tạo bản sao dự án.

- Trang vào: `http://127.0.0.1:57343/`.
- Ứng dụng responsive: `http://127.0.0.1:55300/inbox`.
- Người mua: `mai.nguyen@example.test`.
- Kế toán: `an.ke-toan@example.test`.
- Mật khẩu chung của fixture: `Synthetic-passphrase-123`.

Dùng cửa sổ ẩn danh hoặc profile Chrome khác cho vai Kế toán. Mở tab mới
trong cùng profile vẫn dùng cùng phiên đăng nhập. Trang hướng dẫn không
cấp quyền hay tự đổi vai. Đăng nhập vẫn đi qua GoTrue và chính sách ứng dụng.
Link loopback chỉ mở trên máy này; đây không phải địa chỉ cho điện thoại
khác trong mạng. Trên Chrome desktop có thể bật chế độ thiết bị để thử
mobile. Kiểm viewport không được tính là kiểm thiết bị native.

Trang hướng dẫn và thanh đầu ứng dụng cùng hiển thị commit nền và fingerprint
mã nguồn local. Fingerprint bao gồm cả các file chưa commit trong phạm vi
source/config/fixture. Nếu sửa code khi server đang chạy, tải lại trang
hướng dẫn sẽ báo phiên đang chạy chưa khớp nguồn. Build lại để nạp thay đổi.

## Một hành trình, bốn trụ cột

Fixture mới PO-81724 gồm hai Gmail giả lập thuộc người mua, 110 thư Gmail và
các danh tính Mua hàng, Kế toán, nhà cung cấp, kho, người ngoài. Kế toán chỉ
nhận dữ liệu hồ sơ được bàn giao; hai Gmail không được chia sẻ bằng việc
đổi nhãn vai. Một mailbox phục vụ Mua hàng, một mailbox phục vụ Điều phối kho.

1. **Action Inbox:** thẻ yêu cầu bổ sung dẫn đến đúng hóa đơn và sổ cam kết.
   Soạn yêu cầu, sửa, lưu nháp trên desktop rồi mở cùng tài khoản ở mobile.
2. **Ask Inbox:** đối chiếu hai hạn thanh toán mâu thuẫn và cùng số tiền
   60.000 VND. Mỗi kết luận có trích dẫn phiên bản nguồn; không tự chọn hạn.
3. **Commitment Intelligence:** gửi yêu cầu đã xem trước, nạp hồi đáp cùng
   tên tệp nhưng thiếu hạn để thấy hồ sơ vẫn chờ. Nạp bản hợp lệ, kiểm tra
   tệp, ghi nhận và bàn giao. Kế toán duyệt lại, lịch sử giữ nguồn và theo
   dõi yêu cầu dừng. Chưa có thao tác thanh toán ngân hàng.
4. **AI Operator:** lập kế hoạch lưu trữ thư từ `offers@example.test`, xem
   phạm vi, phê duyệt, thực thi, xác minh rồi xác nhận hoàn tác. Đây là thao
   tác trên trạng thái local, không chứng minh Gmail thật đã đồng bộ nhãn.

Trang điều khiển chỉ nạp mail vào Gmail fixture, gây mất phản hồi, khởi động
lại ứng dụng hoặc khôi phục fixture. Không có nút điều khiển nào thay người
dùng gửi yêu cầu hay duyệt hồ sơ. Phản hồi nạp lại cùng ID không tạo thêm
chứng từ mới. Một tệp thiếu hạn không trở thành bằng chứng đủ điều kiện.

## Gián đoạn và khôi phục

- Đóng/mở phiên Chrome khác và khởi động lại **tiến trình Next** bằng nút
  trên trang hướng dẫn giữ nguyên database, bản nháp và quyết định.
- Nút gây mất phản hồi áp dụng cho lượt gửi tiếp qua Gmail giả lập. Khi
  chưa rõ kết quả, dùng kiểm tra trạng thái gửi; không gửi lại để đoán.
- Nút khôi phục yêu cầu nhập `ĐẶT LẠI`. Nó xác minh checksum snapshot trước
  khi dừng Next/Auth/PostgREST, khôi phục database riêng của fixture, đưa
  hai mailbox giả lập về bộ ban đầu và khởi động lại. Người dùng đăng nhập
  lại. Các lượt gửi thử và sửa đổi trước đó không còn trong bộ đã khôi phục.
- Reset chỉ nhận project Docker `inboxai-local-pilot` hoặc project E2E đã
  định danh, database cố định `inboxai_security_test`, không nhận tên đích
  từ trình duyệt. Không thao tác hosted hay các project Docker khác.
- Dừng toàn bộ supervisor bằng Ctrl+C rồi chạy lại tạo **phiên giả lập mới**.
  Không tuyên bố khôi phục qua mất điện hoặc restart toàn bộ Docker/Mac.
  Snapshot ban đầu ở `test-results/local-pilot/initial.dump` chỉ chứa fixture.
- API key JWT giả lập của phiên preview được cấu hình hạn bảy ngày; phiên
  đăng nhập người dùng vẫn do GoTrue quản lý. Đây là cấu hình thời hạn,
  không phải kết quả kiểm soak test bảy ngày.

## Bằng chứng và giới hạn

```sh
npm run test:local-pilot
```

Bộ kiểm tra dùng Chrome với các phiên buyer desktop/mobile, accountant
mobile và outsider độc lập. Nó kiểm fingerprint, nguồn, lưu nháp, ngắt kết
nối, khởi động lại, gửi đúng một lần, hồi đáp thiếu hạn, bản hợp lệ trùng,
phân quyền, duyệt, Operator và khôi phục. Các màn được chụp và kiểm axe,
tràn ngang. Chạy các harness tuần tự vì dùng chung `.next-build` và cổng E2E.

`test-results/local-pilot/` giữ log, ảnh, báo cáo nhóm assertion và metadata
phiên bản. Đây là dữ liệu giả lập do Codex soạn. Phân loại nền được gán
trong fixture; Ask Inbox dùng đối chiếu xác định. Semantic search chỉ được
coi là sẵn sàng khi màn hình báo có model local. Không có phép đo LLM hay
agent mới, không có số đo công sức người dùng thật hoặc kết luận production.

Kết quả chạy thực tế nằm trong [VERIFICATION.md](VERIFICATION.md). Security
gate cho dữ liệu thật vẫn đóng. Sau nghiệm thu local, ngày 17/11/2026 chủ
sản phẩm cho phép commit/push checkpoint trên `codex/local-pilot`, kế thừa
bản dọn nợ kỹ thuật `38c4767`. Việc này không cho phép merge main, deploy
hoặc khởi động milestone tiếp theo. Rollback code không thay đổi database
hosted vì không có triển khai.
