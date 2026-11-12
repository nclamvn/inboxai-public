# Commitment Intelligence · Nghiệm thu vòng đời cam kết

Ngày 12/11/2026. Mã ứng dụng và migration tại commit local `c230163` trên
`phase2/m0-security-baseline-20261111`. Toàn bộ nghiệm thu dùng tài khoản và
email giả lập. Không push, deploy hoặc kết nối hộp thư thật.

## Kết quả người dùng

Nhân viên mua hàng có thể duyệt lời hứa giao hàng, xác nhận đổi hạn, bàn giao
người phụ trách và xác nhận hoàn tất từ hộp thư kỹ thuật. Sau bốn lần duyệt,
sổ giữ một cam kết, bốn phiên bản và bốn trích dẫn mở được về email gốc. Người
phụ trách cũ hết quyền làm nguồn cho đề xuất thay đổi sau bàn giao. Thư đến
muộn và thư ghi hạn cũ khác hạn đang lưu được giữ để kiểm tra.

Một email có thể đưa ra tối đa bốn đầu việc rõ ràng, mỗi đầu việc có phần
xem trước và lần duyệt riêng. Khi thư sau chỉ ghi “đổi hạn” mà không xác định
đầu việc, ứng dụng giữ đề xuất ở trạng thái cần kiểm tra, kể cả khi mới duyệt
một trong các đầu việc. Người dùng có thể mở email rồi sửa đúng cam kết bằng
luồng xác nhận thủ công trong sổ. Việc quét và xem trước không ghi dữ liệu.

## Kết quả trên cùng bộ hồ sơ mới

22 thư, 7 hồ sơ, 14 sự kiện được gán nhãn quan trọng. Email và nhãn do Codex
viết và khóa trước khi sửa detector, gồm ca bàn giao liên hộp thư, chuyển năm
UTC+7, hai đầu việc chung thư, thư cũ tới sau, lịch mâu thuẫn, điều kiện chưa
chốt và chỉ dẫn giả. Cách diễn đạt có phần giao với các loại tình huống đã
biết của M6-G. [Email](../../tests/eval/commitments/lifecycle/cases.json) ·
[Nhãn](../../tests/eval/commitments/lifecycle/labels.json)

| Phương án | Đúng / đề xuất | Nhận đủ trong 14 | Bỏ sót quan trọng | Tổng thời gian máy |
| --- | ---: | ---: | ---: | ---: |
| InboxAI trước thay đổi | 4/7 | 28,6% | 10 | 1,71 s |
| InboxAI sau thay đổi | 14/14 | 100% | 0 | 2,46 s |
| LLM trực tiếp | 9/20 | 64,3% | 5 | 27,19 s |
| Agent có công cụ đọc | 6/21 | 42,9% | 8 | 41,15 s |

Kết quả đúng phải khớp email tạo cam kết, email phát sinh thay đổi, loại sự
kiện, người phụ trách hoặc hạn khi áp dụng và câu bằng chứng nguyên văn.
Bản mới ghi đủ 14 sự kiện qua API xác nhận và giữ đúng câu dẫn trong lịch sử.
Bốn đề xuất được giữ ngoài luồng duyệt vì người gửi không phụ trách, chưa rõ
đầu việc, thư cũ hoặc hạn cũ mâu thuẫn. Chúng không nằm trong mẫu số đề xuất
có thể duyệt. Theo nhãn, bản cũ cần 2 lần sửa, 1 lần bỏ, 8 lần tạo thêm và
7 lần đối chiếu nguồn. Bản mới cần 14 lần duyệt và 14 lần đối chiếu nguồn,
không có đề xuất cần sửa hoặc bổ sung trong tập này. Đây là số tác vụ ước
tính theo nhãn, chưa đo công hoặc thời gian của người dùng thật.

Bản cũ dùng checkpoint `5ecc2df`. Hai bản sản phẩm dùng cùng trình chạy
Next.js, GoTrue, PostgREST và PostgreSQL, quét khi từng thư đến và mô phỏng
duyệt theo nhãn. Thời gian máy gồm các lượt quét và POST xác nhận đã chấp
nhận. LLM trực tiếp đọc 22 thư qua 7 lần gọi. Agent đọc đủ 22 thư qua 7 lượt
công cụ và 14 lần gọi. Cả hai chạy Qwen3-4B-Instruct-2507 Q4_K_M qua
`llama.cpp b12242` trên loopback, dùng cùng cấu hình M6-G và không ghi sổ.
Các số đo phản ánh một lượt chạy trên macOS arm64 và không gồm nạp model hoặc
thời gian con người. [Bản cũ](../../test-results/commitment-lifecycle/baseline.json) ·
[Bản mới và hai đối chứng model](../../test-results/commitment-lifecycle/comparison.json)

Chạy lại trên bộ M6-G đã biết cho **17/17** sự kiện đúng so với **10/17** ở
bản trước. Đây là hồi quy trên dữ liệu đã dùng để xác định các điểm hụt.
[Điểm hồi quy](../../test-results/commitment-regression/score.json)

## Quyết định nghiệp vụ và phạm vi

- Dùng ngày nhận thư theo UTC+7 để quy đổi “hôm nay” và “ngày mai”. Khi thiếu
  thời điểm nhận, hệ thống không đoán ngày. Phát hiện tự động dùng quy tắc
  tiếng Việt và tiếng Anh với các mẫu lời hứa, đổi hạn, bàn giao và đóng rõ.
- Gắn thay đổi tự động khi có mã hồ sơ rõ, người gửi khớp người phụ trách,
  chỉ một cam kết phù hợp và bằng chứng mới hơn. Nếu cùng người phụ trách,
  thư phải đến từ hộp thư gốc. Sau bàn giao đã xác nhận, người mới có thể
  cập nhật từ hộp thư khác của cùng người dùng. Địa chỉ gửi là tín hiệu
  liên kết nghiệp vụ để người dùng kiểm tra khi duyệt.
- Migration giữ nguyên ID và lịch sử. Sổ cũ được nối lại với mã hồ sơ khi
  nguồn ban đầu còn khớp khóa cũ. Nếu thiếu nguồn, bằng chứng đổi hoặc thứ
  tự thư không xác minh được, ứng dụng giữ thay đổi ngoài luồng duyệt. Bản
  mới cần chạy migration trước. Nếu quay lại bản ứng dụng cũ, giữ migration
  và dữ liệu; bản cũ chỉ có thể hiển thị đề xuất theo cách một thư một mục.
- Tập nhỏ này kiểm chứng luồng và chất lượng trong phạm vi mẫu. Hiệu quả trên
  thư thật, các cách diễn đạt ngoài mẫu và thời gian người dùng vẫn chưa đo.
  [Security gate](SECURITY_GATE.md)

## Kiểm thử local

macOS arm64, Node 24.14.1, Next.js 16.4.6, PostgreSQL 16 trong fixture ứng dụng.

| Kiểm tra | Kết quả |
| --- | --- |
| Trình duyệt vòng đời | 30 kiểm tra gồm Auth, lịch sử bốn nguồn, mở thư hoàn tất, duyệt riêng hai trích đoạn, chặn cam kết mơ hồ, nguồn đã sửa, duyệt đồng thời và thử lại. Desktop, tablet và mobile không tràn ngang hay có lỗi trong tập quy tắc axe đã chạy. [JSON](../../test-results/commitment-lifecycle/browser-run.json) · [Ảnh mobile](../../test-results/commitment-lifecycle/browser/mobile-lifecycle.png) |
| End-to-end toàn ứng dụng và build | 41 kiểm tra, Next.js build ở production mode với cấu hình giả lập. Lần đầu dừng vì ca mua hàng còn đối chiếu thông báo cũ. Assertion được cập nhật theo nội dung mới và chạy lại toàn bộ thành công. [JSON](../../test-results/commitment-lifecycle/e2e.json) · [Log](../../test-results/commitment-lifecycle/e2e.log) |
| Migration và SQL | 17 nhóm kiểm tra. Lần nâng cấp từ bản ghi cũ giữ nguyên ID và nâng phiên bản. Ca sửa nguồn lịch sử và đọc mã hồ sơ của tenant khác bị chặn. [Log](../../test-results/commitment-lifecycle/db.log) |
| Lint, TypeScript, unit và integration | Các lệnh thoát 0. Lint 91 cảnh báo hiện hữu, unit 240/240, integration 197/197, bộ chấm 4/4. [Lint](../../test-results/commitment-lifecycle/lint.log) · [TypeScript](../../test-results/commitment-lifecycle/typecheck.log) · [Unit](../../test-results/commitment-lifecycle/unit.log) · [Integration](../../test-results/commitment-lifecycle/integration.log) · [Bộ chấm](../../test-results/commitment-lifecycle/scorer.log) |

## Chạy lại local

```sh
INBOXAI_COMMITMENT_CORPUS=lifecycle npm run bench:commitments:product
INBOXAI_COMMITMENT_CORPUS=lifecycle npm run bench:commitments -- models
INBOXAI_COMMITMENT_CORPUS=lifecycle npm run bench:commitments -- compare
npm run test:commitment-detection -- --isolated
npm run test:db
npm run test:e2e
```

Đối chứng model cần runtime và model theo checksum trong [M6-G](M6G_LOCAL_HANDOFF.md#tái-lập).
`INBOXAI_COMMITMENT_CORPUS=regression` dùng lại bộ M6-G với thư mục kết quả
riêng. Bộ thử trình duyệt cô lập dùng `.next-build` và cổng loopback riêng để
không ghi đè preview local.

Đã dọn build cô lập, container thử nghiệm và thư mục runtime chứa model,
binary cùng archive. Docker image prune thu hồi 0 B. Preview local cũ vẫn
trả HTTP 200.
