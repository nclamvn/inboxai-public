# Pilot giá trị · Duyệt đúng chứng từ

Mục tiêu là đo xem một cặp Mua hàng–Kế toán có thể rà soát và duyệt lại
hồ sơ nhanh hơn cách làm hiện tại mà vẫn giữ đúng thẩm quyền và nguồn.
Tất cả chứng từ, email và tài khoản trong pilot là giả lập. Luồng bắt đầu
ở ngoại lệ đã có PO, đơn giá, phiếu nhập và yêu cầu bổ sung.

## Bản dùng thử

[Mở bàn điều phối local](http://127.0.0.1:57343/study). Dùng hai hồ sơ
Chrome riêng cho Mua hàng và Kế toán. Thông tin tài khoản giả lập ở mục
**Cách tổ chức phiên**. Điều phối viên nhập mã nhóm ẩn danh và ghi công cụ
đối chứng cùng phiên bản. Người tham gia có thể đọc thư và CSV trên bàn
điều phối hoặc tải CSV vào công cụ local của họ.

- Nhóm thứ nhất chạy `npm run preview:purchase-value`, theo thứ tự cách làm
  hiện tại với bộ B, sau đó InboxAI với bộ A.
- Nhóm thứ hai chạy `npm run preview:purchase-value -- --bundle-b`, theo
  thứ tự InboxAI với bộ B, sau đó cách làm hiện tại với bộ A.
- Mỗi lệnh mở một phiên. Tải JSON sau khi ghi phản hồi cuối phiên, rồi
  dừng phiên đầu trước khi mở phiên tiếp theo. Reload bàn điều phối và
  khởi động lại InboxAI từ bàn điều phối giữ phiên đang chạy. Khởi động
  lại cả tiến trình fixture tạo phiên mới.
- Đăng nhập trước khi tính giờ. Giữ mức hướng dẫn tương đương. Tạm dừng
  khi nghỉ hoặc khi thử khôi phục ngoài quy trình thông thường. Ghi một
  lượt mỗi lần mở nguồn, xin trợ giúp hoặc sửa kết luận đã lập. Các bộ
  đếm do điều phối viên ghi.
- Khi có thư đính chính đến lúc duyệt, ghi bản sơ bộ trong form đối chứng
  hoặc mở bản đã bàn giao trong vai Kế toán, rồi nạp thư mới. Giữ chờ là
  một quyết định nghiệp vụ có chủ đích. Dừng hồ sơ ghi nhận phiên bỏ dở.

Hai bộ có mã PO, người gửi và tệp riêng, với cùng ba dạng rủi ro.

| Ca | Quyết định đúng |
| --- | --- |
| Hai CSV cùng tên, một sai PO. Một thư cũ đến sau | Duyệt đúng phần đính kèm, mã hóa đơn và hạn. |
| Nhà cung cấp gửi tệp thiếu hạn, người khác gửi tệp điền đủ | Giữ yêu cầu bổ sung mở và giữ nguyên hồ sơ gốc. |
| Đính chính đến khi Kế toán đang xem bản bàn giao | Dừng duyệt bản cũ. Xem bản thay thế, bàn giao và duyệt lại đúng nguồn. |

Dữ liệu và đáp án được khóa SHA-256 trước lượt chạy. Quyết định InboxAI
được kiểm tra theo trạng thái hồ sơ, ID quyết định, email và tệp thực trong
PostgreSQL, rồi ánh xạ về ID trong bộ hồ sơ. Phương án hiện tại ghi quyết định
do người dùng nhập. Hai bên giữ nguyên chỉ dẫn nghiệp vụ và mốc nhận thư.
[Corpus và nhãn](../../tests/eval/purchase-value/)

## Chấm hai nhóm

```sh
npm run bench:purchase-value -- participants /đường/dẫn/nhóm-a.json /đường/dẫn/nhóm-b.json
```

Bộ chấm chỉ nhận hai báo cáo đã hoàn tất, khác nhóm, đảo thứ tự, cùng mã
nguồn và corpus. Quyết định được chấm lại từ nhãn khóa. Báo cáo máy tự động
bị từ chối ở bước này. Lưu bản xuất local dưới mã nhóm, dùng dữ liệu giả lập
và ghi công cụ thực tế. Người điều phối xác nhận nguồn gốc bản xuất.

Cổng đề xuất mở rộng gồm cả ba điều kiện. InboxAI phải hoàn tất đúng từng
hồ sơ với 0 duyệt sai. Trung vị thời gian xử lý chủ động phải giảm ít nhất
25% và cả hai nhóm muốn thử tiếp. Chỉ tính mức tiết kiệm khi hai cách đều hoàn tất đúng tất cả
hồ sơ. Các cách vẫn được báo cáo riêng về lỗi và thời gian quan sát. Số trường cần sửa của model, số lần thao tác Chrome
và công của người dùng là ba phép đo riêng.

## Tái lập nghiệm thu kỹ thuật

```sh
npm run test:purchase-value
npm run test:purchase-value -- --bundle-b
npm run living:model -- --prepare-only
npm run living:model
```

Sau khi model mở cổng loopback, chạy hai lệnh sau trong terminal riêng.

```sh
npm run bench:purchase-value -- models
npm run bench:purchase-value -- compare
```

Qwen3 4B và llama.cpp b12242 dùng cache đã kiểm SHA-256 trong checkout.
LLM trực tiếp đọc toàn bộ thư và CSV của hồ sơ. Agent dùng cùng model, đọc
chỉ mục rồi chọn thư qua một công cụ chỉ đọc trước khi quyết định. Hai nhánh
có cùng thông tin về PO, nhà cung cấp, hạn và thứ tự thư. Ca đính chính có
hai ảnh chụp dữ liệu trước và sau khi thư mới đến. Các nhánh model đưa ra
đề xuất và không thực hiện thao tác ghi. Kịch bản Chrome mô phỏng người đọc
mở dữ liệu và áp dụng quy tắc; thời gian này dùng để tái lập kịch bản.

CI chạy cả hai thứ tự Chrome và lưu báo cáo cùng ảnh giả lập. Bộ chấm
người tham gia vẫn cần hai phiên thực tế.

Kết quả máy và báo cáo hai thứ tự nằm trong
`test-results/local-pilot/study/value/`, `reverse/` và `preview/`. Đây là
các thư mục kết quả của cùng một bản thử. Phiên này chạy local với dữ liệu
giả lập và không mở cổng dùng hộp thư thật.
