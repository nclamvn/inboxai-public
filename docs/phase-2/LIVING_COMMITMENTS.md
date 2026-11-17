# Cam kết sống: phạm vi và cách nghiệm thu local

Milestone được owner cho phép ngày 17/11/2026, trên nhánh
`codex/living-commitments`. Không push, merge, deploy hoặc dùng email thật.
Giữ kiến trúc Next/Supabase, sổ cam kết và API quyền hiện có.

## Kết quả cần kiểm chứng

Người dùng chọn một hội thoại đã đồng bộ, yêu cầu LLM local đọc lời hứa,
trách nhiệm, hạn và diễn biến. Trước khi ghi sổ, họ thấy câu nguồn, trạng
thái trước/sau và có thể sửa các trường của loại thay đổi đang duyệt.
Ngày số rõ ràng được code đổi sang ISO từ chính câu dẫn chứng; model
không được coi là máy tính lịch đáng tin cậy. Không dùng confidence làm
xác suất đúng. Nội dung email không phải quyền hay chỉ dẫn hệ thống.

LLM chỉ tạo đề xuất, không gửi email hay tự sửa sổ. Chưa chốt, người gửi
không có thẩm quyền, trích dẫn không khớp, thư cũ đến muộn và nguồn ngoài
hội thoại được giữ ngoài đường xác nhận. Model vẫn có thể hiểu sai câu có
trích dẫn chính xác hoặc bỏ sót cam kết: người rà soát và phép đo riêng là
bắt buộc. Không suy ra độ chính xác từ số bài kiểm thử xanh.

## Ranh giới kỹ thuật

- `/commitments/living` và `/api/commitments/living` chỉ bật bằng cờ
  server `INBOXAI_LIVING_LOCAL=1`; API còn buộc Supabase là gateway local
  được định danh. Không sử dụng provider model cloud hoặc khóa mặc định.
- Model endpoint cố định `http://127.0.0.1:57340/v1/chat/completions`,
  không nhận URL/model/tùy chọn thực thi từ browser. Redirect bị từ chối,
  mỗi lượt tối đa 60 giây, một lượt suy luận đồng thời trong tiến trình,
  JSON output schema và token budget cố định. Không có retry model ngầm.
- Scope là tenant + tài khoản + Gmail thread. Tiêu đề giống nhau không
  đủ để ghép; chuyển trách nhiệm sang người khác trong cùng hội thoại
  được kiểm theo email, không tự suy email từ tên hiển thị. Chưa tự nối
  các thread khác tài khoản bằng tên hoặc chủ đề tương tự.
- Giới hạn 16 email, 8.000 ký tự mỗi email, tổng 24.000 ký tự. Vượt giới
  hạn phải báo thiếu phạm vi; không cắt một hội thoại rồi gọi đã đọc hết.
  Trang chọn hội thoại hiển thị từ 250 thư gần nhất, không phải tìm kiếm
  toàn bộ lịch sử mailbox.
- `private.living_analyses` giữ kết quả đã kiểm cấu trúc, phiên bản model,
  fingerprint nguồn và số đo. Cache theo tenant/scope/snapshot/model-prompt;
  tải lại không gọi lại model. Cần policy retention trước rollout dữ liệu thật.
- Tạo và cập nhật dùng lại `save_commitment`, append revision và bằng chứng.
  RPC xác nhận nhận analysis/event/version, không nhận nguồn do browser thay.
  State chỉ cho các trường cam kết thông thường, không mở quyền PO/kho/tiền.
- Advisory lock hội thoại được lấy cả lúc thay nguồn và lúc duyệt. Snapshot
  được đọc lại sau lock; thêm thư mới cũng làm đề xuất cũ hết hiệu lực.
  Ledger version được kiểm riêng để chặn tab cũ dù email chưa đổi.
- Receipt được lưu cùng revision. Mất phản hồi thử lại cùng key/payload,
  không gọi model lại hoặc tạo bản ghi thứ hai. Receipt còn đọc lại được
  sau khi nguồn đổi; đó là bằng chứng đã ghi, không phải quyền áp dụng lại.
- Khóa cam kết gắn với scope, email tạo và câu bằng chứng tạo, không dùng
  số thứ tự việc do model có thể đổi. Phân tích mới chỉ liên kết tự động khi
  giữ được câu tạo đó. Model đổi cách chọn câu có thể làm mất liên kết; chưa
  có phép nối ngữ nghĩa được kiểm chứng, không coi đây là trí nhớ hoàn hảo.
- Bảng private bật RLS và revoke direct access. Model-cache writer dành
  cho service role, actor luôn lấy từ session xác thực server. User RPC
  dùng `auth.uid()`; admin/service không được gọi RPC duyệt thay người dùng.

## Phép đo đã định trước

`tests/eval/living/cases.json` gồm 40 hội thoại mới, 53 sự kiện theo nhãn.
`FROZEN.json` khóa digest dữ liệu và nhãn trước đo. Tập gồm lời nói gián
tiếp, ngày tương đối, chuyển người, hai việc cùng thư, thư cũ đến muộn,
nguồn không có trách nhiệm, yêu cầu/có điều kiện, phủ định và chỉ dẫn giả.
Tác giả dữ liệu/nhãn là Codex, chưa có người gán nhãn độc lập. Các ca không
được dùng để chỉnh prompt sau khi đã xem kết quả đo. Một email thử riêng
về sổ tay vận hành dùng làm smoke test trước tập đo.

Bốn nhánh cùng mục tiêu đầu ra và dữ liệu: rules hiện có (kèm bộ liên kết
đơn giản), InboxAI với LLM và guard, LLM trực tiếp, agent đọc thư bằng công
cụ chỉ đọc. Cùng Qwen3-4B-Instruct-2507 Q4_K_M, llama.cpp b12242, một slot,
context 8.192, seed 82, temperature 0 và tắt prompt cache. Agent tối đa hai
lượt đọc và ba lượt model. Rules không gọi model. Direct/agent chỉ đề xuất;
InboxAI còn lưu lịch sử có xác nhận. Không buộc agent phải dùng database
sản phẩm để coi là đối chứng; sự khác nhau được báo rõ.

Đúng phải khớp nguồn, nguồn tạo, chỉ mục việc trong thư, loại sự kiện,
người/hạn theo trường áp dụng, và câu trích xuất hiện nguyên văn. Không
chấm tự động tính tương đương ngữ nghĩa của tiêu đề; đây là giới hạn của
phép đo. Đề xuất trùng chỉ tính đúng một lần. Báo precision, recall, ca lỗi,
token và thời gian. Công duyệt/bỏ/tạo bù chỉ ước tính theo nhãn, không phải
số click hoặc thời gian người dùng thật. Không gọi script là người đọc.

Không suy ra tiết kiệm thời gian người dùng từ tổng số thao tác giả định:
một lần tạo bù có thể tốn hơn nhiều một lần duyệt. Baseline nhận tên account
`work/finance`; đường sản phẩm nhận UUID account và metadata từ PostgreSQL.
Nội dung thư và nhiệm vụ tương đương nhưng JSON input không giống từng byte.
Một lượt mỗi baseline, phần lớn direct chạy trước agent, không đủ để kết luận
ưu thế latency. Thời gian từ chuẩn bị mailbox đến kết quả dùng được bởi người
thật, năng lượng và chi phí khấu hao phần cứng chưa được đo.

Đo đầu: InboxAI đúng 37/39 đề xuất, recall 37/53. Đo lặp trên code guard-v2:
40/42, recall 40/53; hai hội thoại LC-17 và LC-27 đổi output, dù cùng prompt,
seed và model. Không gọi lượt lặp là tập chưa thấy hoặc thay số lần đầu bằng
kết quả đẹp hơn. Cả hai giữ lỗi ngày tương đối LC-05 và nhận nhầm câu hỏi thành
lời hứa ở LC-31. Không tinh chỉnh prompt để sửa các ca này rồi chấm lại trên
cùng nhãn. Chất lượng chưa đạt mục tiêu recall 90% và chưa chứng minh lợi ích
cho người thật. Trạng thái nghiệm thu luồng kỹ thuật được báo riêng.

## Nghiệm thu Chrome

```sh
npm run test:living-commitments
npm run bench:living-commitments
npm run bench:living-commitments -- compare
```

Model phải được khởi động trước, theo runtime/checksum trong báo cáo.
Hành trình chạy hai Gmail loopback qua sync checkpoint, không mock suy luận.
Mỗi hội thoại được mở trên Chrome desktop/mobile luân phiên. Reviewer giả
lập dùng nhãn để quyết định đề xuất nào được duyệt; đây là nghiệm thu thao
tác, tách biệt kết quả chất lượng trước khi duyệt. Những đề xuất sai/thiếu
không được bỏ khỏi bảng đối chứng.

Các bài kiểm gián đoạn riêng gồm nguồn mới đến khi dialog còn mở, phiên
bản sổ đổi ở tab khác, mất phản hồi ghi, mất mạng, restart Next và mở lại
biên nhận/lịch sử bằng phiên mobile khác. Kiểm tenant khác và anonymous,
axe/tràn ngang ở các màn đã chụp. Không có gửi email trong milestone.

Kết quả thực tế, ca thất bại và giới hạn model được ghi trong
[VERIFICATION.md](VERIFICATION.md), không tự coi mục tiêu trong tài liệu
này là kết quả đã đạt. Artifact đo nằm ở `test-results/living-commitments/`.

## Chạy lại và dùng thử

Trên macOS arm64, mở hai terminal từ repository:

```sh
# Terminal 1: tải một lần, kiểm SHA-256 rồi chạy model loopback
npm run living:model
# Terminal 2: fixture biệt lập, build production local và gieo 40 hội thoại
npm run preview:living
```

Model/runtime được pin trong `scripts/living-model.mjs`, cache tái sử dụng
tại `node_modules/.cache/inboxai-living-model` (khoảng 2,4 GiB). Không sao
chép project hoặc tạo output build theo task. Lần chuẩn bị đầu cần internet
để tải artifact công khai; suy luận và email fixture đều chạy local. Có thể
chuẩn bị riêng bằng `npm run living:model -- --prepare-only`.
Runtime lấy từ [llama.cpp b12242](https://github.com/ggml-org/llama.cpp/releases/tag/b12242),
weights GGUF pin digest từ [Ollama Qwen3](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M).

Preview ở `http://127.0.0.1:57300/commitments/living`, tài khoản giả lập
`mai.nguyen@example.test`, mật khẩu `Synthetic-passphrase-123`. Dừng bằng
Ctrl+C. Fixture được tạo lại ở mỗi lần chạy preview; không hứa giữ dữ liệu
qua việc hủy toàn bộ fixture. Phép kiểm restart giữ PostgreSQL và khởi động
lại Next, rồi đăng nhập bằng phiên browser mới. Không phải kiểm mất đĩa
hoặc native device. Dừng preview trước khi chạy các test dùng cổng 57300
và `.next-build`. Preview ghi artifact trong thư mục con `preview`, không
xóa bằng chứng đo chính.

Phân tích được người dùng chủ động yêu cầu theo hội thoại, chưa phải worker
LLM quét nền mọi thư. Khi có nguồn mới, đề xuất cũ bị chặn khi duyệt và được
báo stale khi tải lại; muốn đọc diễn biến mới phải phân tích lại. Mọi hạn,
người và trạng thái đã ghi có thể xem trong Ask Inbox từ nút trên đề xuất,
với câu nguồn của từng phiên bản. Đây là câu trả lời từ sổ bằng code, không
phải đo chất lượng hỏi đáp LLM tự do.

## Rollback

Migration mới `20261117010000_living_commitments.sql`, không sửa migration
đã áp dụng. Chỉ áp dụng vào fixture local trong milestone. Khi bỏ thử nghiệm,
recreate fixture hoặc khôi phục snapshot local trước migration; rollback code
không tự xóa bảng/RPC/trigger. Môi trường hosted không được thao tác. Không
đổi chuẩn đồng bộ, credential vault hay cổng dùng email thật.
