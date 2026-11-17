# Cam kết sống 2: giảm bỏ sót có kiểm chứng

Owner cho phép ngày 17/11/2026. Tiếp tục trên `codex/living-commitments`,
chỉ local, Gmail giả lập và LLM local thật. Không commit/push/deploy hoặc
dùng hộp thư thật trong milestone. Bằng chứng milestone đầu được giữ riêng.
Database của preview trước đã được backup trước khi thay fixture.

## Đầu ra cho người dùng

Tìm lời nhận làm tự nhiên, kể cả chưa có hạn; giữ lịch sử tạo rồi thay đổi,
khép hoặc hủy; tách nhiều việc trong một email. Model chọn câu chứng cứ và
liên kết ngôn ngữ. Code lấy người gửi, email được giao trách nhiệm rõ ràng,
đổi ngày rõ nghĩa từ thời điểm gửi ở Việt Nam, và kiểm nguồn/thẩm quyền.
Ngày mơ hồ giữ null và hiện cần đối chiếu, không tự đoán. Model vẫn có thể
hiểu sai; trích dẫn khớp không đồng nghĩa suy luận được chứng minh đúng.

Một lời gọi model tối đa 60 giây, không retry/agent/reviewer ngầm. Thử trên
tập phát triển cũ cho thấy chưa có lý do thêm lượt đọc mặc định. Vẫn giới
hạn 16 thư/8.000 ký tự mỗi thư/24.000 ký tự toàn phạm vi và 32 đề xuất.
Quote được giữ nguyên byte và mở rộng tới câu đầy đủ khi xác định được;
item theo vị trí việc trong email tạo, không theo thứ tự model trả về.

Giao diện phân biệt chưa phân tích, đang phân tích, đọc cache, chưa hoàn
tất, chưa tìm thấy đề xuất, cần đối chiếu, nguồn cũ và đã ghi nhận. Không
có trạng thái nào bảo đảm đã tìm hết cam kết. Chọn hội thoại khác không
được nhận nhầm response trước. Phân tích chưa ghi sổ; mỗi lần ghi vẫn cần
người dùng xác nhận và giữ version/request key trong lần thử lại.

Migration forward `20261117020000_living_coverage.sql` dùng nguồn tạo
đã được xác nhận để nối quote ngắn/câu đầy đủ khi chỉ có đúng một cam kết
khớp. Cùng email gốc, tenant, scope và bằng chứng còn khả dụng là bắt buộc;
không nối theo tên việc. Nhiều kết quả khớp phải chặn. Không sửa migration
trước; rollback bằng fixture/snapshot local, không chạm hosted.

## Phép đo khóa trước tinh chỉnh

- 60 hội thoại mới, 71 sự kiện; `tests/eval/living-coverage/FROZEN.json`
  khóa cases/labels/protocol trước thay inference. Digest:
  `146fa9ae63053797bdeae0a50aea5f83de1b3fd1273cf525b591cc6cf9add907`.
- Dữ liệu/nhãn do Codex tạo, không gán nhãn độc lập hoặc người thật.
  Ngày năm 2027 là thời gian giả lập trong email, không phải ngày chạy test.
- 40 hội thoại cũ là tập phát triển/hồi quy. Có các lượt prompt thử và lỗi
  được giữ ở `test-results/living-coverage/development-*.json/log`.
  Kết quả cũ dùng để sửa prompt không được báo như kiểm tra chưa thấy.
- Candidate source hash được khóa trước khi runner gửi ca mới đầu tiên
  tới model. Không chỉnh engine sau khi xem kết quả held-out rồi dùng lại
  tập đó để tuyên bố đạt. Lỗi giao thức/ca không hoàn tất không bị loại.
- Mục tiêu đề xuất: strict precision >=95%, strict recall >=90%. Đây là
  mục tiêu thử nghiệm, chưa phải chứng nhận cho dữ liệu thật.
- Chấm đúng source/origin/item/kind, owner/due theo trường áp dụng, quote
  nguyên văn và chứa anchor việc. Detection recall bỏ qua owner/due được
  báo riêng để không gọi sai ngày là hoàn toàn không phát hiện lời hứa.
  Chưa chấm ngữ nghĩa tiêu đề hoặc entailment bằng người độc lập.

Giữ ba module v1 với hash trong `tests/eval/living-coverage/legacy` làm
đối chứng bản cũ. Bridge contracts chỉ giải quyết import sibling, không đổi
byte nguồn cũ. So với pipeline v2, direct LLM và agent đọc thư chỉ đọc trên
cùng cases. Direct prompt lấy toàn bộ thư và tự trả owner/due. Agent thực
sự quyết định đọc, tối đa hai batch/ba lượt model. Product dùng code lọc
quoted text, kiểm quyền và lịch; các khác biệt được báo thay vì gọi input
giống từng byte. Tất cả cùng weights/runtime/hardware và token budget.
Thứ tự bốn nhánh CLI luân phiên mỗi ca, một slot, không chạy Chrome/model
consumer khác đồng thời. Chrome đo đường API riêng, không đánh đồng với
thời gian chỉ chạy pipeline CLI.

Công duyệt/loại/tạo bù và kiểm nguồn là số ước tính từ nhãn. Reviewer giả
lập biết gold để kiểm luồng thao tác, không phải bằng chứng người dùng
thật hoặc phép đo công sửa độc lập. Không tự quy đổi chúng thành giờ tiết
kiệm. Chi phí phần cứng/năng lượng chưa đo; token/local latency được ghi.
Số thẻ bị chặn/chưa chốt và hội thoại âm tính vẫn hiện thẻ cần xem được báo
riêng. Không dùng precision của phần được phép duyệt để che công đọc các
ứng viên còn lại trong UI.

## Lệnh tái lập

```sh
npm run living:model
# Chạy tuần tự, không dùng model consumer khác cùng lúc:
npm run bench:living-coverage
npm run test:living-coverage
npm run bench:living-coverage -- --compare
# Sau khi dừng fixture test, để dùng thử:
npm run preview:living-coverage
```

Runner baseline giữ kết quả theo từng cặp case/method và chỉ tiếp tục phần
chưa chạy; error đã ghi không tự chạy lại. Dừng preview trước test hoặc
build dùng `.next-build`/cổng 57300. API keys của preview fixture có hạn bảy
ngày để không chết sau một giờ; session người dùng vẫn theo GoTrue bình
thường. Các khóa này chỉ dành cho mạng loopback và mailbox giả lập.

Chrome gieo hai Gmail qua sync, mở cả 60 hội thoại ở viewport desktop/mobile,
chấm đề xuất trước xác nhận, kiểm không có đề xuất khi offline, duyệt có
nguồn, cắt phản hồi, restart Next, đóng/mở lại tiến trình Chrome và chặn tab
cũ khi nguồn hoặc sổ thay đổi. Một ca riêng kiểm nối quote đã duyệt và giữ
chỉnh sửa tay. Không có gửi email trong milestone. Viewport không phải
native device. Kết quả thật và giới hạn ghi trong `VERIFICATION.md`.

## Kết quả chốt trong phạm vi giả lập

Đúng 67/71 sự kiện, precision 95,7%, strict recall 94,4%; đạt mục tiêu
thử nghiệm đề xuất. Bản cũ trên cùng tập đúng 52/71. Có ba sự kiện không
được phát hiện và một sai/thiếu ngày; còn ba đề xuất sai. Lượt CLI và hai
lượt Chrome giữ cùng kết quả, không sửa engine sau khi mở tập đo.

Đổi lại, ứng viên phải xem tăng 64 lên 84 và tổng thời gian CLI tăng
268,7 lên 324,3 giây. Chưa chứng minh giảm công người thật. Sáu trong
16 hội thoại không có cam kết vẫn có thẻ cần xem, so với hai ở bản cũ.

Giữ các lỗi CV-03/16/19/20/43/54 trong báo cáo; không vá trên cùng tập
rồi gọi là dữ liệu chưa thấy. Xem [VERIFICATION.md](VERIFICATION.md) và
[evidence/living-coverage-20261117.json](evidence/living-coverage-20261117.json).
