# M6-G Kiểm chứng Commitment Intelligence

## Bản local cố định

Checkpoint ứng dụng `d438220457c31851171b4979d3c8695092ca23ab` trên nhánh
`phase2/m0-security-baseline-20261111` chứa M6-C đến M6-F. Cây `src` là
`d74e3416fbee739cd2df581701444f6680866645` và cây `supabase` là
`0cbea28dfffbbbef3696ec95bf8683df5fa0211b`. Benchmark dùng lại route phát hiện,
xác nhận, lịch sử và PostgreSQL hiện có. Lượt chạy tạo database riêng ở cổng
`57300` và xác minh phiên bản sổ trước và sau từng lượt quét. Các lượt xác nhận
thành công giữ nguyên email nguồn, câu trích và trạng thái đã lưu. Hai lần dựng
riêng cho cùng đề xuất, trạng thái chặn và số phiên bản đã ghi.

Tập thử gồm 25 email giả lập trong 10 hồ sơ, hai tài khoản và 17 sự kiện, trong
đó 14 sự kiện được tác giả bộ dữ liệu gán nhãn quan trọng. Tập được viết riêng
cho M6-G, khóa trước khi chấm và chưa dùng để chỉnh bộ phát hiện sản phẩm. Các ca
gồm đổi hạn, chuyển người, hoàn tất, hủy, thư cũ tới muộn, nhiều cam kết trong
một thư, lịch có điều kiện và chỉ dẫn độc hại. Tác giả tự gán nhãn, chưa có
thẩm định độc lập. [Email](../../tests/eval/commitments/cases.json) ·
[Nhãn](../../tests/eval/commitments/labels.json)

## Kết quả tự động

| Phương án | Đúng / đề xuất | Precision | Recall | Bỏ sót quan trọng | Trung vị máy / hồ sơ | Tổng máy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| InboxAI | 10/11 | 90,9% | 58,8% (10/17) | 6/14 | 0,237 s | 2,250 s |
| LLM trực tiếp | 14/21 | 66,7% | 82,4% (14/17) | 2/14 | 3,721 s | 31,472 s |
| Agent có công cụ | 14/22 | 63,6% | 82,4% (14/17) | 2/14 | 5,373 s | 48,093 s |
| Đọc thủ công | Chờ người thực hiện | — | — | — | — | — |

Một đề xuất đúng phải khớp loại sự kiện, thư nguồn, thư tạo cam kết,
người phụ trách và hạn theo trường áp dụng, kèm nguyên câu dẫn chứng quyết
định. Trích đoạn phải xuất hiện trong đúng thư. Từng sự kiện chỉ được tính
đúng một lần. Có trích đoạn nguyên văn vẫn có thể sai thẩm quyền hoặc ngày.
Trong tập này, số đề xuất có câu trích nguyên văn là 11/11, 21/21 và 22/22.

| Công xác nhận ước tính theo nhãn | Duyệt đúng | Sửa | Bỏ | Tạo thêm | Đối chiếu nguồn |
| --- | ---: | ---: | ---: | ---: | ---: |
| InboxAI | 10 | 1 | 0 | 6 | 11 |
| LLM trực tiếp | 14 | 2 | 5 | 1 | 21 |
| Agent có công cụ | 14 | 1 | 7 | 2 | 22 |

Các cột đo số tác vụ rà soát theo nhãn, với một lần đối chiếu nguồn trên mỗi
đề xuất. Ba trường hợp sản phẩm chặn không nằm trong tổng đề xuất có thể duyệt.
Đây là khối lượng thao tác ước tính, chưa phải thời gian hoặc thao tác của
người dùng. Nhánh InboxAI đo thời gian HTTP quét từng thư đến và xác nhận
những đề xuất đúng trong database. Bộ duyệt theo nhãn bỏ qua đề xuất sai và
không tự bổ sung sự kiện bị thiếu. Một lần bỏ sót tạo cam kết có thể làm lần
cập nhật sau bị chặn. Hai nhánh model nhận toàn bộ chuỗi theo thứ tự thư đến
và trả danh sách sự kiện, không ghi sổ. Độ trễ không gồm nạp model ban đầu,
thời gian người dùng, thời gian seed fixture hoặc truy vấn kiểm tra kết quả.

Cả hai nhánh model dùng Qwen3-4B-Instruct-2507 Q4_K_M trên `llama.cpp b12242`,
Apple M1 Max, RAM 32 GiB, macOS 27.2. Cấu hình một slot, ngữ cảnh 4.096,
`temperature=0`, seed 82, một lượt làm nóng ngoài phép đo và `cache_prompt=false`.
LLM đọc cả chuỗi trong một lần gọi mỗi hồ sơ. Agent nhận tiêu đề, người gửi,
tài khoản và thời điểm, rồi tự chọn ID cho công cụ đọc cục bộ và tạo kết quả
từ thư đã mở. Cùng bộ hướng dẫn nghiệp vụ, mỗi nhánh có hướng dẫn giao thức
riêng. LLM dùng 10 lần gọi và 4.657 token đầu vào. Agent dùng 20 lần gọi, 10
lượt đọc và 12.476 token đầu vào. Hai nhánh đọc đủ 25 thư. Trong lần chạy thử
giao thức, runner từ chối một số kết quả vì model lặp lại danh sách ID đã đọc
trong lệnh kết thúc. Lượt đo hoàn chỉnh bỏ qua danh sách thừa ở bước đó và
vẫn kiểm chứng từng nguồn đã được công cụ đọc. Các ngày tiếp tục được kiểm
tra bằng Zod sau suy luận.
[Model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) ·
[Bản lượng tử hóa](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M) ·
[llama.cpp b12242](https://github.com/ggml-org/llama.cpp/releases/tag/b12242)

Trong mẫu này, lợi thế đã quan sát của InboxAI là ít đề xuất sai và ghi được
lịch sử có bằng chứng qua xác nhận. Điểm yếu tập trung ở diễn đạt gián tiếp,
nhiều cam kết cùng thư, hạn tương đối và việc theo dõi sau khi chuyển người phụ
trách qua tài khoản khác. Cả hai nhánh model đưa lịch có điều kiện, thư cũ tới
muộn và ngày đổi bởi bên thiếu thẩm quyền vào kết quả. Agent có thêm lượt đọc
nhưng không tăng số sự kiện đúng so với cùng model gọi trực tiếp trong mẫu này.
Số liệu chưa đủ để kết luận tiết kiệm công trên hộp thư thực tế.

## Tái lập

Node 24.14.1, npm 11.11.0, Next.js 16.4.6, Docker local với image PostgreSQL 16,
GoTrue 2.197.0, PostgREST 14.18, Mailpit 1.28.1 và Caddy 2 Alpine. Bộ test dùng
image đã có với `--pull never`. Đảm bảo `.env*` của Next không có trong checkout
và các cổng dành cho fixture còn trống. SHA-256 của `package-lock.json` là
`34cbd559caa8402600f84d19a8087061b5cee19159f9852cd3c63868ed50f97d`. Sau khi
có các dependency theo lockfile, chạy các lệnh sau. [Image digest local](../../test-results/m6g/container-images.json)

```sh
npm run bench:commitments:product
npm run bench:commitments -- manual
npm run bench:commitments -- compare
```

Lệnh `compare` cần các tệp `direct.json` và `agent.json` từ bước chạy model.
Để tạo chúng, chuẩn bị hai tệp công khai đúng SHA-256, giải nén runtime và mở
model trên loopback trong terminal riêng.

```sh
mkdir -p test-results/m6g/runtime
curl -fL https://github.com/ggml-org/llama.cpp/releases/download/b12242/llama-b12242-bin-macos-arm64.tar.gz -o test-results/m6g/runtime/llama.tar.gz
curl -fL https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9 -o test-results/m6g/runtime/qwen3-4b.gguf
shasum -a 256 test-results/m6g/runtime/llama.tar.gz test-results/m6g/runtime/qwen3-4b.gguf
```

Runtime `d58f23da84befb84b7d07590e7fd18ea68a3f1df59f9808b52370255aa60f20b`.
Model `85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9`.

```sh
tar -xzf test-results/m6g/runtime/llama.tar.gz -C test-results/m6g/runtime
test-results/m6g/runtime/llama-b12242/llama-server \
  --model test-results/m6g/runtime/qwen3-4b.gguf --alias qwen3-4b-m6g \
  --host 127.0.0.1 --port 57340 --ctx-size 4096 --parallel 1 --n-gpu-layers 99
```

Trong terminal thứ hai, chạy `npm run bench:commitments -- models` rồi
`npm run bench:commitments -- compare`. Dừng server model bằng Ctrl+C sau khi
đo. Báo cáo lưu trong `test-results/m6g/`. Hàm chấm đối chiếu SHA-256 tập email,
kiểm tra đúng phạm vi trường hợp và từ chối tệp kết quả trùng hoặc thiếu ca.

Đọc thủ công dùng tệp `test-results/m6g/manual.html` được tạo bởi lệnh `manual`.
Có thể mở trực tiếp hoặc chạy `npm run bench:commitments -- manual --serve`
và mở `http://127.0.0.1:57341/`. Chọn 3 hoặc 10 hồ sơ, tải JSON và chạy
`npm run bench:commitments -- compare /duong/dan/m6g-manual.json`. Báo cáo ghép
các phương án theo đúng tập hồ sơ người đó đã làm. Form ghi thời gian, số thư
đã mở, lần thay đổi trường và số dòng tạo hoặc bỏ. Bài thử Chrome xác nhận
xuất và đọc lại JSON bằng thao tác tự động. Chỉ một lần đọc của người thật
mới đi vào nhánh thủ công.

[So sánh cục bộ](../../test-results/m6g/comparison.json) ·
[API và sổ cam kết](../../test-results/m6g/local-run.json) ·
[Nhánh InboxAI](../../test-results/m6g/product.json) ·
[LLM trực tiếp](../../test-results/m6g/direct.json) ·
[Agent](../../test-results/m6g/agent.json)

## Kiểm thử và phạm vi

| Lệnh hoặc quan sát | Kết quả |
| --- | --- |
| `npm run bench:commitments:product` | Exit 0 hai lần, mỗi lần qua 15 kiểm tra gồm Auth/RLS và xác nhận bằng chứng. Hai bộ kết quả chức năng giống nhau. |
| `node --test tests/eval/commitments/benchmark.test.mjs` | Exit 0, 3 ca kiểm tra chấm trùng, trích nguồn và sai tập dữ liệu. |
| Chrome nhập và xuất form thủ công | Qua kịch bản tự động trên form 3 hồ sơ. Không tính vào kết quả người đọc. |
| `npm run test:e2e` | Exit 0, 41 kiểm tra và build production mode với cấu hình giả lập. [Báo cáo](../../test-results/m6g/e2e-report.json) |
| `npm run test:unit` và `npm run test:integration` | Exit 0, 238 và 197 test. |
| `npm run lint` và `npm run typecheck` | Exit 0. Lint có 91 cảnh báo hiện hữu và 0 lỗi. |

Chỉ có dữ liệu giả lập. Tệp model và runtime công khai được tải bằng yêu cầu
đọc rồi kiểm SHA-256. Suy luận chạy trên loopback. Cổng dùng hộp thư thật và
production vẫn đóng. Bản preview M6-D trên `55300` vẫn chạy build trước đó.
Đã dừng server model và xóa runtime/model tạm cùng `.next-build` sau khi đo.
Container và network kiểm thử được dọn. Docker image prune thu hồi 0 B.
Báo cáo và form đọc thủ công được giữ lại.
