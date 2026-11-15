# Chốt bản local cho luồng bổ sung và duyệt lại chứng từ

Ngày 15/11/2026. Phạm vi bắt đầu khi Kế toán thấy hóa đơn thiếu hạn, tiếp
tục qua việc giao yêu cầu, tìm và ghi nhận đúng chứng từ thay thế, bàn giao,
duyệt lại và kiểm tra sau tải lại. Dữ liệu chỉ đi qua Chrome, Next.js, các
dịch vụ PostgreSQL local và hai Gmail giả lập trên loopback. Không phát lệnh
chuyển tiền hay gửi email. Security gate hiện vẫn đóng.

## Kết quả Chrome

| Hồ sơ | Tình huống | Kết quả quan sát |
| --- | --- | --- |
| PO-9536 | Hai tệp cùng tên trong một thư, một tệp sai PO, một bản sao đã gửi trước | Chọn đúng phần MIME `b` của thư `n02`. Kế toán duyệt INV-9136 và hồ sơ rời Inbox của hai vai. |
| PO-9648 | Thư cũ được giao sau thư mới, kèm một bản thay sai hóa đơn và mất phản hồi khi duyệt | Duyệt INV-9148 từ `n03/a`. Thử lại với cùng khóa nhận lại cùng mã quyết định. Nhật ký chỉ có một lần duyệt. |
| PO-9752 | Tệp đúng người gửi thiếu hạn. Tệp có hạn đến từ người gửi ngoài hồ sơ | Giữ trạng thái chờ Mua hàng. Hóa đơn gốc còn nguyên và lịch sử chỉ có yêu cầu bổ sung. |
| PO-9869 | Hai đính chính cùng thay một hóa đơn, một tiêu đề chứa lệnh giả | Hiện hai ứng viên và không tự chọn một bản. Hồ sơ vẫn chờ và không ghi hóa đơn mới. |

Kiểm tra quyền đi qua API có xác thực và Chrome hai vai. Kế toán và người
ngoài không đọc được ứng viên trong hộp thư Mua hàng, người ngoài không
mở được API bản bàn giao. Sau lần duyệt, Chrome tải lại, xác nhận lịch sử và
kiểm tra ID email lẫn ID tệp đã ghi. Sáu ảnh qua axe và kiểm tra tràn ngang.
Hai lượt Chrome chốt cho cùng kết quả nghiệp vụ, lượt sau dùng Compose
khóa bằng digest. [Kiểm tra Chrome](../../test-results/purchase-release/report.json)
· [Bằng chứng quyết định và thời gian](../../test-results/purchase-release/browser.json)

## So sánh trên cùng bốn hồ sơ

Tập do Codex soạn, gồm 9 thư và 10 phần đính kèm. SHA-256 của dữ liệu và
nhãn được khóa trước khi chạy. Kết quả đúng phải khớp cả quyết định, ID thư,
ID phần MIME, mã hóa đơn và hạn. Một đề xuất duyệt có bất kỳ sai lệch nào
được tính là đề xuất duyệt sai. Cột sửa đếm hồ sơ có sai và số trường
cần sửa theo nhãn. [Dữ liệu](../../tests/eval/purchase-release/cases.json)
· [Nhãn](../../tests/eval/purchase-release/labels.json)
· [Từng sai lệch](../../test-results/purchase-release/comparison.json)

| Phương án | Khớp nhãn | Tổng thời gian đến quyết định | Hồ sơ / trường cần sửa | Đề xuất duyệt sai | Bỏ sót duyệt |
| --- | ---: | ---: | ---: | ---: | ---: |
| InboxAI trên Chrome | 4/4 | 1,52 giây | 0 / 0 | 0 | 0 |
| Đọc thủ công mô phỏng trên Chrome | 4/4 | 8,66 giây | 0 / 0 | 0 | 0 |
| LLM trực tiếp | 0/4 | 5,76 giây | 4 / 16 | 3 | 1 |
| Agent có công cụ đọc thư | 0/4 | 8,52 giây | 4 / 12 | 4 | 0 |

- **InboxAI.** Tính từ vào Inbox đến khi hiện trạng thái giữ chờ hoặc mở
  bản xem trước có hạn. Đường này mở 0 email và hai bản xem trước. Tổng
  ba đoạn giao yêu cầu, chọn chứng từ và ghi đến khi trình duyệt nhận
  xác nhận duyệt là 1,88 giây cho PO-9536 và 1,58 giây cho PO-9648, có
  thử lại khi mất phản hồi. Không gồm thời gian thư đến, đăng nhập, tạo
  dữ liệu gốc, suy nghĩ của người dùng hay tải lại sau khi lưu.
- **Đọc thủ công mô phỏng.** Chrome mở trực tiếp chín thư đã khoanh vùng
  và tải mười tệp. Kịch bản đối chiếu metadata và đọc byte CSV bằng quy
  tắc, độc lập với kết quả InboxAI và nhãn. Thời gian bao gồm điều hướng,
  tải và chạy quy tắc. Chưa đo tìm thư ngoài tập, thời gian đọc của con
  người hoặc công sửa thủ công. Thứ tự hai phương án Chrome luân phiên
  giữa các hồ sơ.
- **LLM và agent.** Qwen3 4B chạy thật trên máy qua llama.cpp b12242.
  LLM nhận toàn bộ dữ liệu trong một lượt mỗi hồ sơ. Agent nhận chỉ mục
  thư, chọn ID để công cụ đọc trả nội dung và dùng lượt model thứ hai
  để quyết định. Cùng quy tắc, seed 82, temperature 0, tắt cache prompt
  và dùng chế độ không thinking. Hai nhánh đề xuất quyết định, không
  ghi dữ liệu. Thời gian không gồm nạp model hay đối chiếu và sửa đầu ra
  bởi người. LLM dùng 4 lượt đo với 2.450 token vào và 196 token ra.
  Agent dùng 8 lượt với 3.907 token vào và 268 token ra. Không gọi API
  trả phí. Lượt làm nóng ban đầu chạm giới hạn token, được chạy lại với
  chỉ dẫn định dạng rõ và cùng chế độ cho cả hai nhánh đo.
- **Ranh giới kết luận.** Cả hai nhánh model gắn nhầm phần MIME ở
  PO-9536 và đề xuất duyệt hai ca cần giữ chờ. Đây là kết quả của một
  cấu hình model cụ thể trên bộ nhỏ do Codex soạn. Chưa có phép đo trên
  chứng từ thật, người dùng thật, hay model khác. Không diễn giải số
  trường sửa theo nhãn thành số lần thao tác người dùng thực hiện.

## Chạy lại

Môi trường đã chạy gồm macOS 27.2 trên Apple M1 Max, Node 24.14.1,
npm 11.11.0, Next.js 16.4.6, Chrome 157.0.8103.79 và Docker Compose 5.7.0.
Dùng checkout hiện tại, `package-lock.json` và Compose local. Nếu cần
cài gói mới, dùng `npm ci`. Nếu Docker chưa có image, tải trước đúng
[digest đã khóa](../../tests/local-auth/purchase-release.compose.yml).
Lượt nghiệm thu không tự tải image. Các port loopback của fixture phải
đang trống. Chạy các lệnh trình duyệt lần lượt vì dùng chung `.next-build`.

```sh
npm run test:purchase-release
npm run test:purchase-supplements
npm run test:staging -- --isolated
```

Để chạy model, dùng cặp runtime và weights khớp SHA-256 ghi trong
[hướng dẫn M6-G](M6G_LOCAL_HANDOFF.md#tái-lập). Chuẩn bị các tệp công khai
này trước khi chạy benchmark. Từ gốc repository, khởi động server trong
terminal riêng.

```sh
test-results/m6g/runtime/llama-b12242/llama-server \
  --model test-results/m6g/runtime/qwen3-4b.gguf --alias qwen3-4b-m6g \
  --host 127.0.0.1 --port 57340 --ctx-size 4096 --parallel 1 --n-gpu-layers 99 \
  --reasoning off --chat-template-kwargs '{"enable_thinking":false}'
```

```sh
npm run bench:purchase-release -- models
npm run bench:purchase-release -- compare
```

Bộ chấm chỉ đọc nhãn sau các lượt chạy. Nó từ chối report Chrome lỗi,
sai bộ hồ sơ hoặc digest, thiếu lượt duyệt/thử lại, không đạt nhãn
InboxAI hoặc có nhánh model thiếu đầu ra. Kết quả chi tiết, ảnh và log
nằm tại `test-results/purchase-release/`.

## Kiểm tra hồi quy trong GitHub Actions

Job `purchase-release-chrome` chạy cùng lệnh `npm run test:purchase-release`
trên Ubuntu 24.04 với Google Chrome. Job tải đúng các image đã khóa rồi
chạy với dữ liệu giả lập và các dịch vụ loopback trên runner. Kết quả
Chrome được đối chiếu trực tiếp với nhãn đã khóa, gồm đúng phần tệp
đính kèm, hồ sơ phải giữ chờ và bằng chứng thử lại lúc duyệt. Job lưu
JSON và ảnh nghiệm thu trong bảy ngày. Nó chạy trên pull request và
các nhánh được khai báo ở bộ lọc push của workflow.
