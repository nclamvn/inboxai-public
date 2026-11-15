# Action Inbox · Theo dõi cam kết hằng ngày

Nghiệm thu ngày 12/11/2026, commit local `48b843a` trên nhánh
`phase2/m0-security-baseline-20261111`.
Các tài khoản, email, quyết định nghiệp vụ và phản hồi trong lần chạy đều là
giả lập. Trình duyệt và máy chủ sử dụng fixture local. Lời nhắc được thu bởi
Mailpit qua kết nối SMTP TLS local.

## Luồng đã nghiệm thu

Inbox đưa cam kết giao bộ ống dẫn đã quá hạn lên trên việc kiểm đếm đến hạn
hôm nay. Từ cùng một hàng, người dùng mở được email nguồn hoặc lịch sử sổ.
Việc đã khép, việc còn xa hạn và thư quảng cáo không chiếm chỗ trong danh sách.

Người dùng xem địa chỉ gửi, địa chỉ nhận, tiêu đề, toàn bộ nội dung và email
nguồn trước khi xác nhận. Hai yêu cầu đồng thời cùng bản xem trước chỉ tạo
một biên nhận và một thư trong Mailpit. Lượt kiểm tra cố ý làm mất phản hồi
HTTP sau khi máy chủ đã nhận thư. Kiểm tra lại và tải lại Inbox cho cùng
kết quả đã gửi. Biên nhận cũ còn đọc lại được sau khi khép cam kết.

Phản hồi chưa xác nhận lịch tự xuất hiện sau chu kỳ làm mới, có nguyên văn
và giữ nguyên hạn đã duyệt. Chrome dùng đồng hồ thử nghiệm để kiểm tra
chu kỳ 60 giây. Thư xác nhận lịch mới tạo phiên bản thứ hai sau khi người dùng
duyệt. Mục quá hạn rời Inbox khi hạn được dời sang tương lai. Khi thư bàn giao
đến, đề xuất hoàn tất vẫn xuất hiện trong Inbox. Người dùng duyệt để tạo
phiên bản thứ ba, mở email hoàn tất từ sổ và xác nhận cùng một cam kết đã khép.

Thử đổi người nhận trong lệnh đặt chỗ gửi, sửa thư nguồn sau khi xem trước,
dùng phiên ẩn danh và truy cập từ tenant thứ hai đều bị chặn.
[Kết quả Chrome](../../test-results/commitment-attention/report.json) ·
[Màn hình Inbox](../../test-results/commitment-attention/inbox-desktop.png) ·
[Bản xem trước](../../test-results/commitment-attention/reminder-desktop.png)

## Quyết định nghiệp vụ

- Danh sách giới hạn bốn mục có nguồn hợp lệ. Phản hồi cần xử lý và bản ghi
  có bằng chứng cần kiểm tra đứng trước hạn quá hạn và hạn hôm nay. Ngày
  tính theo UTC+7. Bộ lọc tài khoản áp dụng cho nguồn hiển thị.
- Lời nhắc nhanh dùng thư đến đã xác nhận của người phụ trách hiện tại, có
  mã hồ sơ và tài khoản gửi đang hoạt động. Việc của chính mình chỉ xuất hiện
  để xử lý. Khi có thư mới từ người phụ trách cùng hồ sơ, ứng dụng yêu cầu
  kiểm tra trước khi gửi thêm lời nhắc.
- Nội dung lời nhắc tạo từ tiêu đề cam kết và hạn đã duyệt. Mỗi phiên bản
  chỉ có một yêu cầu gửi. Khi đặt chỗ gửi, PostgreSQL đối chiếu lại phiên bản,
  bằng chứng, tài khoản, người nhận và nội dung đã hiển thị. Một lời nhắc
  phiên bản trước còn chưa rõ kết quả sẽ chặn lời nhắc mới.
- Inbox rà trang 24 email gần nhất theo quy tắc phát hiện hiện có, thêm
  mẫu phản hồi chưa chốt lịch. Với cách diễn đạt chưa được nhận diện, người
  dùng có thể mở email và đối chiếu trong sổ. [Security gate](SECURITY_GATE.md)

## Đối chiếu trên cùng hồ sơ

Corpus gồm 10 email giả lập và 5 quyết định cần có nguồn. Đầu ngày cần nhận
ra hai việc đang tới hạn. Ba phản hồi tiếp theo lần lượt yêu cầu kiểm tra,
đề xuất đổi hạn và đề xuất khép. Kết quả đúng phải khớp hành động, hồ sơ,
email nguồn, hạn còn hiệu lực và câu bằng chứng. Corpus được xuất từ lần
kiểm tra Chrome và đối chiếu bằng SHA-256. [Corpus và lượt chạy](../../test-results/commitment-attention/workflow.json)

| Phương án | Quyết định đúng | Thiếu hoặc sai | Số email riêng biệt mở/đọc | Công sửa theo nhãn | Thời gian ghi nhận |
| --- | ---: | ---: | ---: | --- | ---: |
| InboxAI | 5/5 | 0 | 3 | 0 | 9,83 s trên trình duyệt |
| Đọc Inbox mô phỏng | 5/5 | 0 | 10 | Chưa đo | 8,91 s mở và hiển thị thư |
| LLM trực tiếp local | 2/5 | 3 | 10 | 2 sửa, 1 bổ sung | 11,68 s suy luận |
| Agent có công cụ đọc local | 2/5 | 3 | 8 | 3 sửa, 2 bỏ | 21,01 s suy luận và đọc qua công cụ |

InboxAI hiển thị một số bằng chứng ngay trên hàng hoặc trong bản xem trước,
nên ba lượt mở thư là số điều hướng tới email, không phải số nguồn hệ thống
đã đọc. Thời gian InboxAI gồm các bước kiểm tra trong trình duyệt, thao tác
gửi, lấy lại biên nhận và tải lại. Lượt đọc Inbox được chạy tự động và Codex
điền quyết định trên hồ sơ đã biết. Thời gian chỉ đo thao tác mở thư.

Hai đối chứng dùng Qwen3-4B-Instruct-2507 Q4_K_M, `llama.cpp b12242`,
temperature 0 và seed 82 trên cùng máy. Mỗi giai đoạn chỉ nhận thư đã đến
và trạng thái sổ đã được xác nhận tới lúc đó. LLM đọc nội dung trực tiếp
trong 4 lần gọi. Agent có công cụ chỉ đọc và dùng 8 lần gọi. Hai đối chứng
trả quyết định kèm nguồn. Luồng InboxAI còn duyệt, gửi và lưu lịch sử.
Các thời gian này chưa cho phép kết luận về công hoặc tốc độ của người dùng thật.
[Đọc mô phỏng](../../test-results/commitment-attention/manual-assessment.json) ·
[Kết quả model](../../test-results/commitment-attention/models.json)

## Nghiệm thu kỹ thuật

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:commitment-attention` | 22 kiểm tra với SMTP TLS, hai tenant và ba viewport. [Kết quả](../../test-results/commitment-attention/report.json) |
| `npm run test:e2e` | 41 kiểm tra, gồm build Next.js ở production mode với cấu hình giả lập. [Kết quả](../../test-results/commitment-attention/e2e.json) |
| `npm run test:design -- --isolated` | 25 kiểm tra giao diện tham chiếu. [Kết quả](../../test-results/commitment-attention/design.json) |
| `npm run test:platform -- --isolated` | 19 kiểm tra. Với 600 email, tải dòng đầu trong 971–1.030 ms ở ba viewport, 439.132 byte JavaScript nén và một request cho phần cam kết ở lần mở Inbox. [Số đo](../../test-results/commitment-attention/platform/after.json) |
| `npm run test:db` | 18 nhóm kiểm tra, gồm mốc ngày UTC+7 và phân quyền RPC đặt chỗ gửi. [Log](../../test-results/commitment-attention/db.log) |
| Lint, TypeScript, unit, integration | Thoát 0. Lint 91 cảnh báo hiện hữu, 241 unit test và 197 integration test. [Log lint](../../test-results/commitment-attention/lint.log) · [TypeScript](../../test-results/commitment-attention/typecheck.log) · [Unit](../../test-results/commitment-attention/unit.log) · [Integration](../../test-results/commitment-attention/integration.log) |

Các bộ trên có ca Auth dùng chung. Lần đầu của luồng mới phát hiện địa chỉ
giả lập nằm ngoài miền SMTP mà fixture chấp nhận. Đổi địa chỉ trong fixture,
giữ nguyên chính sách SMTP, rồi chạy lại. Lượt đầu của kiểm tra nền tảng còn
gắn cứng cổng preview cũ. Đổi harness sang hai origin của fixture và chạy lại.

Trình chạy dùng Chrome local trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
GoTrue, PostgREST và PostgreSQL 16. Có ảnh và kiểm tra axe lấy mẫu trên desktop,
tablet và mobile web. [Ảnh mobile](../../test-results/commitment-attention/inbox-mobile.png)

## Chạy lại và phục hồi

```sh
npm run test:commitment-attention
node tests/eval/commitment-attention.mjs
```

Lệnh đầu dựng, nạp lại fixture và đóng tài nguyên thử nghiệm. Lệnh hai đọc
chính corpus xuất từ lượt Chrome. Nó cần model và server local đã mô tả ở
[M6-G](M6G_LOCAL_HANDOFF.md#tái-lập). Migration mới chỉ thêm index và RPC.
Nếu quay lại bản ứng dụng trước, giữ migration và các biên nhận đã gửi.

Đã dọn `.next-build`, thư mục runtime gồm model, binary và archive, cùng
container của bộ thử và thư mục TLS của lần chạy bị ngắt. Docker image prune
thu hồi 0 B.
