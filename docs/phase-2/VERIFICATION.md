# Verification record

## Kiểm tra luồng bổ sung chứng từ trong CI

Ngày 15/11/2026 trên macOS arm64, Node 24.14.1 và Chrome 157.0.8103.79.
Đã tải image fixture theo digest và chạy `npm run test:purchase-release`
với build production local, hai Gmail giả lập và PostgreSQL. Exit 0,
19 kiểm tra, gồm đối chiếu cả bốn quyết định Chrome với nhãn đã khóa.
Kiểm tra bộ chấm với kết quả bị thay đổi xác nhận nó từ chối phần MIME
sai, thiếu lượt ghi hợp lệ, ghi vào hồ sơ giữ chờ và thiếu thử lại.

`npm run lint`, `npm run typecheck`, `npm run test:unit`,
`npm run test:integration` và `npm run test:db` exit 0 ở local.
Lint có 92 cảnh báo cũ. Unit có 252 test, integration có 200 test và
database có 47 nhóm. Workflow YAML đã được parse và kiểm tra nhánh
kích hoạt cùng lệnh Chrome. [Luồng CI và bằng chứng](PURCHASE_LOCAL_RELEASE.md#kiểm-tra-hồi-quy-trong-github-actions).

## Chốt bản local cho luồng bổ sung và duyệt lại chứng từ

Ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79, PostgreSQL 16 và hai Gmail giả lập qua loopback.
Bộ khóa SHA-256 có bốn PO, chín thư, mười phần đính kèm. Chrome theo
hai vai, xác nhận hai lần duyệt hợp lệ, giữ hai hồ sơ chờ, thử lại
một lần mất phản hồi và xác minh lại ID nguồn sau tải lại. Từng ảnh
chụp qua axe và kiểm tra tràn ngang. Lượt Chrome đầu phát hiện
assertion kiểm quyền trỏ vào trang khung 200 thay vì API tài nguyên.
Đã chuyển kiểm tra sang API 404. Hai lượt hoàn chỉnh sau đó cho
cùng kết quả nghiệp vụ.

| Lệnh | Kết quả |
| --- | --- |
| `npm run test:purchase-release` | Exit 0. 18 kiểm tra, gồm 4 hồ sơ mới và 14 kiểm tra nền. Build Next hoàn tất 121 bước tạo trang. |
| `npm run bench:purchase-release -- models` | Exit 0. Hai nhánh Qwen3 4B local hoàn tất cả 4 hồ sơ. |
| `npm run bench:purchase-release -- compare` | Exit 0. InboxAI 4/4, đọc thủ công mô phỏng 4/4, LLM trực tiếp 0/4, agent 0/4. |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint còn 92 cảnh báo có sẵn. |
| `npm run test:unit`, `npm run test:integration`, `npm run test:db` | Exit 0. 252 unit, 200 integration, 47 nhóm database. |
| `npm run test:purchase-supplements` | Exit 0. 41 kiểm tra hồi quy. |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu, khôi phục. |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra trình duyệt. |

[Hồ sơ nghiệm thu, quy tắc đối chứng và hướng dẫn chạy lại](PURCHASE_LOCAL_RELEASE.md).
Mọi lượt chạy dùng dữ liệu giả lập. Phép đo thủ công là thao tác và đọc
CSV mô phỏng trong Chrome. Thời gian con người và công sửa thực tế chưa
được đo. Cổng hộp thư thật vẫn đóng.

## Tìm thư bổ sung cho hồ sơ đang chờ

Nghiệm thu ngày 15/11/2026 trên Chrome, Next.js 16.4.6, PostgreSQL 16 và
hai Gmail giả lập qua loopback. Cùng PO-9422, đường tìm theo Inbox mở
ba email đã chọn cho kịch bản và xem các tệp. Đường dẫn từ thẻ hồ sơ
mở thẳng ID tệp và bản xem trước đúng với không lần mở email.
Đây là số thao tác trên kịch bản, chưa có số đo thời gian người dùng.

Bộ thử đưa hai tệp cùng tên vào một thư, gửi lại đúng byte ở thư khác,
gửi sai PO và gửi bản cũ sau. Chỉ bản đúng vào nhóm khớp và tệp sai đi
vào mục đối chiếu. Khi thêm bản thứ hai cùng thay hóa đơn đang hiệu
lực, cả hai được trình bày để chọn, và không hiện nút gợi ý duy nhất.
Kế toán, người ngoài và phiên ẩn danh không đọc được ứng viên của
Mua hàng. Dấu vết nội dung sai và lệnh xác nhận cho hồ sơ khác bị chặn.

Xác nhận bản bổ sung trên Chrome chỉ ghi một hóa đơn khi mất phản hồi.
Bản cạnh tranh rời nhóm khớp sau lần ghi. Mua hàng bàn giao, Kế toán
duyệt lại và hồ sơ rời Inbox hai phía. Mở lại email nguồn truy được
đúng ID tệp dù email có hai liên kết cùng tên. Lượt đầu phát hiện lỗi
chỉ mục khi role cập nhật email, và lượt Chrome thử trước cần chờ
chuyển trang, phân biệt ID tệp trong bước kiểm chứng cuối. Các lượt
chốt dưới đây chạy qua những điểm đã sửa.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-supplements` | Exit 0. 41 kiểm tra gồm 2 nhóm bổ sung và 39 nhóm hồi quy. 20 màn qua axe và kiểm tra tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 121 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 47 nhóm, gồm quyền đọc danh sách và chặn gọi RPC ghi nhận ngoài phạm vi |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

Giới hạn hiện tại là hóa đơn CSV thuộc đúng thư và hồ sơ giống hợp
đồng đầu vào của luồng mua hàng. Chứng cứ nằm trong
`test-results/purchase-supplements/`. [Phạm vi và phép đo](PURCHASE_SUPPLEMENTS.md).

## Inbox dẫn việc từ yêu cầu bổ sung đến duyệt xong

Nghiệm thu ngày 15/11/2026 trên Chrome, Next.js 16.4.6 và PostgreSQL 16
local với hai Gmail giả lập. Kịch bản PO-9422 so sánh hai đường vào cùng
một hồ sơ trong cùng trạng thái. Cả Mua hàng và Kế toán đi từ ba lần bấm
qua Cam kết xuống còn một lần bấm từ Inbox. Đây là phép đo điều hướng
tự động, chưa đo thời gian thao tác con người.

Chrome kiểm tra quyền theo tài khoản, đường tải chứng từ được giao,
yêu cầu bổ sung chuyển sang chờ Kế toán, bản mới đến làm bản bàn giao
cũ mất nút duyệt, và việc duyệt lại bị mất phản hồi vẫn dùng một
biên nhận. Sau khi tải lại, việc đã khép rời Inbox hai phía còn lịch
sử và email nguồn vẫn truy được từ hồ sơ. Luồng tiếp tục kiểm tra
chứng từ sai PO, đến muộn, thiếu hạn và người ngoài hồ sơ.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-focus` | Exit 0. 39 kiểm tra gồm 3 nhóm dẫn việc và 36 nhóm hồi quy. 18 màn qua axe và kiểm tra tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 120 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 47 nhóm, có thêm quyền đọc Inbox theo vai, bộ lọc tài khoản và nguồn thiếu |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra trước lần thêm link bảng công nợ và ưu tiên bản cần bàn giao lại |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra trước chỉnh cuối. Chrome và SQL cuối áp dụng migration chốt |

Kết quả không xác nhận giá trị trên hộp thư thật. Chứng cứ nằm trong
`test-results/purchase-focus/`. [Luồng và đối chứng điều hướng](PURCHASE_FOCUS.md).

## Lập và duyệt đợt thanh toán

Nghiệm thu ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail giả lập qua loopback
cho Mua hàng và Kế toán. Người duyệt độc lập dùng phiên InboxAI riêng.

Khoản tạm giữ vì thiếu chứng từ bị chặn khi chọn và khi gọi API xem
trước. Kế toán không thể tự duyệt hay gán người chưa được cấp quyền.
Đính chính INV-8714 làm đề nghị cũ hết hiệu lực dù tổng tiền giữ nguyên.
Kế toán hủy đề nghị cũ rồi lập lại với hai PO. Mất phản hồi khi duyệt
trả đúng một biên nhận và quyết định. Số đã đối chiếu vẫn là 0 ₫ sau
khi duyệt. Chứng từ có ngày chuyển trước ngày duyệt, dù email đến sau,
không được gắn vào đợt mới.

Ba chứng từ 25.000 ₫, 60.000 ₫ và 35.000 ₫ đưa số còn phải đối chiếu
từ 120.000 ₫ về 0 ₫. Phản hồi bị mất sau khi ghi chứng từ 25.000 ₫
được thử lại và nhận cùng biên nhận. Đợt chỉ khép một lần, giữ ba nguồn
sau khi tải lại. Kế toán mở lại đúng email, người duyệt chỉ thấy
chứng từ trong phạm vi được giao. PostgreSQL kiểm tra thêm việc một
khoản hoàn cập nhật số đã đối chiếu của đợt gốc mà không tự giữ lại
khoản phải trả.

Lượt Chrome đầu phát hiện tên biến trùng tên cột trong truy vấn xác
quyền. Đã sửa và kiểm tra lại ở PostgreSQL và Chrome. Các bộ hồi quy
giao diện, hiệu năng và staging chạy trước lần bổ sung quy tắc ngày
chứng từ. Lượt Chrome và PostgreSQL cuối kiểm tra quy tắc đó.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-batches` | Exit 0. 41 kiểm tra, gồm 5 nhóm đợt thanh toán và 36 nhóm hồi quy. 19 màn qua axe và kiểm tra tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 120 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 47 nhóm, gồm quyền duyệt, giữ phạm vi, ngày chứng từ, đóng đợt và hoàn tiền |
| `npm run test:design -- --isolated` | Exit 0. 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0. 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

Kịch bản dùng chứng từ Gmail giả lập và số dư VND trước thuế. Quyền
duyệt do bộ kiểm thử cấp trước trong database local. Chứng cứ nằm trong
`test-results/purchase-batches/`.

## Xử lý ngoại lệ công nợ từ yêu cầu bổ sung đến duyệt lại

Nghiệm thu ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail loopback cho Mua hàng
và Kế toán. Ba phiên InboxAI độc lập gồm hai vai xử lý và người ngoài.

Trong PO-9422, Kế toán yêu cầu bổ sung hạn cho INV-8702. Phản hồi bị mất
sau khi ghi, rồi thao tác thử lại trả cùng biên nhận. Bảng có đúng một
mục chờ Mua hàng và chặn cả yêu cầu ghi khoản trả đã xem trước. Tệp sai
PO, bản thiếu hạn và thư đến sau mang chứng từ cũ đều bị chặn. Bản
INV-8712 mất hiệu lực duyệt khi INV-8713 đến. Kế toán trả lại, Mua hàng
bàn giao đúng người phụ trách và Kế toán đối chiếu hai bản trước khi duyệt.

Mất phản hồi khi duyệt cũng trả lại đúng quyết định khi thử lại. Bảng
giữ một dòng 60.000 ₫ theo INV-8713 với hạn mới. Tải lại trang giữ
đủ năm sự kiện và mở đúng email chứng từ. Chứng từ trả tiền của bản
cũ tiếp tục bị chặn, bản hiện hành xem trước được. Lượt chạy đầu dừng
ở bước mở ngăn chứng từ trong bài kiểm thử. Bộ kiểm thử đã sửa để mở
ngăn, bấm liên kết và kiểm tra email đích thực sự hiển thị.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-exceptions` | Exit 0. 36 kiểm tra, gồm 4 nhóm ngoại lệ và 32 nhóm hồi quy. 16 màn qua axe và kiểm tra tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 118 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 46 nhóm, gồm quyền đọc, quyền ghi, chống yêu cầu lặp và bảo toàn quyết định cũ |
| `npm run test:design -- --isolated` | Exit 0. 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0. 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

Kịch bản dùng hóa đơn CSV và số dư VND trước thuế. Google và nguồn
ngân hàng đều giả lập. Chứng cứ nằm trong `test-results/purchase-exceptions/`.

## Công nợ cần xử lý theo hạn thanh toán

Nghiệm thu ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail giả lập chạy qua loopback.
Chrome dùng ba phiên độc lập cho Mua hàng, Kế toán và người ngoài.

Ba PO đi qua nhập chứng từ, bàn giao và duyệt. Bảng xếp hạn thanh toán
theo hóa đơn đã duyệt và ghi rõ hồ sơ thiếu hạn. Đồng hồ trình duyệt
chuyển qua nửa đêm Việt Nam, đổi nhãn từ hôm nay sang quá hạn. Khoản trả
200.000 ₫ trên hóa đơn 312.000 ₫ để lại đúng 112.000 ₫. Khi có đính chính,
hạn cũ và đường tải tài liệu cũ bị thu hồi. Sau khi duyệt lại, đúng một
mục mang hạn mới và số dư 104.000 ₫. Sau khi trả đủ, mục rời bảng. Khoản
bị hoàn và thử lại khi mất phản hồi đưa đúng một mục 104.000 ₫ trở lại.
Tải lại trang giữ số dư và nguồn. Khoản thay thế khép mục lần nữa.

Chrome mở email hóa đơn thuộc Mua hàng, tải đúng bản CSV được bàn giao
cho Kế toán và mở đúng email chứng từ hoàn. Người ngoài nhận danh sách
rỗng và không thể tải chứng từ. Truy cập ẩn danh bị từ chối. Lượt đầu
phát hiện trùng tên cột trạng thái trong truy vấn danh sách. Truy vấn
đã sửa và bộ DB gọi trực tiếp RPC để bắt lại lỗi tương tự.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-dues` | Exit 0. 32 kiểm tra với ba PO và hai Gmail giả lập. 13 màn qua axe và kiểm tra tràn ngang, gồm bảng công nợ ở 1.380 px và 390 px |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 118 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 45 nhóm, gồm CSV có hạn và không hạn, đầu vào sai và quyền đọc RPC |
| `npm run test:design -- --isolated` | Exit 0. 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0. 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

Bảng theo dõi số dư trước thuế VND trong phạm vi hồ sơ đã bàn giao.
Các đối chiếu ngân hàng, Gmail thật và tải thực tế nhiều hồ sơ vẫn chưa
được đo. Chứng cứ Chrome nằm trong `test-results/purchase-dues/`.

## Đối soát khoản chuyển bị hoàn và mở lại công nợ

Nghiệm thu ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Dùng hai Gmail loopback và ba vai
InboxAI độc lập gồm Mua hàng, Kế toán và người ngoài hồ sơ.

Hóa đơn đã ghi đủ 304.000 ₫. Chứng từ `RT-78101` trỏ đến giao dịch
`BANK-78102` và hoàn 104.000 ₫. Chứng từ sai mã, vượt tiền gốc, gửi lại
dưới tên và định dạng khác, hay cộng dồn vượt giao dịch gốc đều bị chặn.
Mua hàng và người ngoài không có quyền ghi chứng từ. Khi mất phản hồi
sau lúc ghi, Chrome thử lại và nhận cùng biên nhận. Công nợ mở lại đúng
104.000 ₫, với nguồn hiển thị theo quyền hộp thư. Khoản thay thế
`BANK-78103` được ghi từ chứng từ CSV trong phiên Chrome mới của Kế toán.
Sau khi tải lại, cả hai vai thấy số dư 0 ₫ và lịch sử giữ đủ bốn dòng.
Các lượt đầu phát hiện GoTrue local cạn cổng TCP đến PostgreSQL. Bản
nghiệm thu chạy với pool kết nối giới hạn trong Docker kiểm thử.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-return` | Exit 0. 26 kiểm tra gồm 4 nhóm hoàn tiền, 8 nhóm hồi quy nghiệp vụ và 14 kiểm tra nền. 11 màn qua axe và kiểm tra tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 116 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 44 nhóm, gồm mẫu CSV và nâng cấp với khoản trả cùng biên nhận đã tồn tại |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

[Cách chạy lại](PURCHASE_RETURN.md) · [Báo cáo Chrome](../../test-results/purchase-return/report.json) · [Ảnh xem trước khoản hoàn](../../test-results/purchase-return/09-xem-truoc-hoan-tien.png) · [Ảnh Mua hàng thấy công nợ mở lại](../../test-results/purchase-return/10-mua-hang-cong-no-mo-lai.png) · [Ảnh khép lại trên Chrome mobile](../../test-results/purchase-return/11-ke-toan-khep-lai-cong-no.png).

## Đối soát thanh toán và khép công nợ

Nghiệm thu ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail loopback của Mua hàng và
Kế toán, với ba phiên InboxAI cho hai vai đó và người ngoài hồ sơ.

Trên `PO-9418`, Kế toán ghi 200.000 ₫ cho `INV-7803` trị giá 312.000 ₫.
Mua hàng thấy còn 112.000 ₫ và không mở được thư nguồn của Kế toán.
Chứng từ gửi lại dưới tên khác, có BOM và ký tự xuống dòng khác, bị nhận
diện theo mã giao dịch. Hệ thống chặn chứng từ vượt số dư và bản xem trước
tạo trước khi một khoản khác được ghi. Bản đính chính có giá trị 304.000 ₫.
Hệ thống chặn chứng từ ghi `INV-7803` và giữ khoản đã trả. Kế toán duyệt `INV-7804`,
ghi thêm 104.000 ₫ và thử lại sau khi Chrome bỏ phản hồi đầu tiên. Thử
lại trả cùng biên nhận. Cả hai vai thấy hai giao dịch, đúng 304.000 ₫
đã ghi và số dư 0 ₫ sau tải lại. Người ngoài và người dùng chưa đăng
nhập bị chặn. Kịch bản ghi nhận 0 lần gửi Gmail.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-settlement` | Exit 0. 22 kiểm tra, gồm 4 nhóm thanh toán, 4 nhóm bàn giao và 14 kiểm tra nền. 8 màn qua axe và kiểm tra tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Hoàn tất bước tạo 116 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo đã có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 42 nhóm, gồm quyền RPC, số tiền nguyên VND và ngày hợp lệ |
| `npm run test:purchase-payment` | Exit 0. 20 kiểm tra hồi quy đối soát trước thanh toán |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

[Cách chạy lại](PURCHASE_SETTLEMENT.md) · [Báo cáo Chrome](../../test-results/purchase-settlement/report.json) · [Ảnh xem trước khoản trả một phần](../../test-results/purchase-settlement/05-xem-truoc-tra-mot-phan.png) · [Ảnh khép công nợ trên Chrome mobile](../../test-results/purchase-settlement/08-ke-toan-khep-cong-no-mobile.png).

## Bàn giao hồ sơ từ Mua hàng sang Kế toán

Nghiệm thu ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail loopback chứa chứng từ Mua
hàng và Kho. Ba phiên InboxAI riêng mô phỏng Mua hàng, Kế toán và người ngoài.

Mua hàng bàn giao đợt `INV-7802`. Kế toán đọc và tải đúng bốn tệp dẫn
chứng. Truy cập ngoài phạm vi và gọi thẳng đường duyệt từ Mua hàng hoặc
người ngoài đều bị chặn. Kế toán trả hồ sơ kèm lý do, được lưu cùng danh
tính người trả. Hóa đơn `INV-7803` đính chính số lượng xuống 39. Phiếu kho
đến muộn làm lượt bàn giao đang mở hết hiệu lực. Sau lần bàn giao mới,
Chrome bỏ phản hồi duyệt đã ghi thành công. Thử lại dùng cùng khóa và nhận
cùng biên nhận. Sau tải lại, nhật ký có đúng một lần duyệt của Kế toán và
số cộng dồn giữ nguyên 89 bộ, gồm 50 bộ đã duyệt ở đợt trước. Có 0 lần
gửi thư tới Gmail giả lập. Luồng chỉ xác nhận đủ căn cứ thanh toán.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-handoff` | Exit 0. 18 kiểm tra gồm 4 nhóm nghiệp vụ và 14 kiểm tra nền. Bốn ảnh Chrome qua axe và kiểm tra không tràn ngang |
| Next.js production build trong bộ Chrome | Exit 0. Tạo đủ 114 trang |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint có 92 cảnh báo hiện có |
| `npm run test:unit`, `npm run test:integration` | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 41 nhóm, gồm giữ quyết định cũ qua nâng cấp, phạm vi quyền, chặn gọi RPC trực tiếp, ghi nhật ký và thử lại |
| `npm run test:purchase-installments`, `npm run test:purchase-payment` | Exit 0. 22 và 20 kiểm tra hồi quy |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

[Phạm vi và cách chạy lại](PURCHASE_HANDOFF.md) · [Báo cáo Chrome](../../test-results/purchase-handoff/report.json) · [Ảnh Kế toán xem chứng từ](../../test-results/purchase-handoff/01-ke-toan-chung-tu.png) · [Ảnh sau duyệt trên Chrome mobile](../../test-results/purchase-handoff/04-duyet-mobile.png).

## Đối soát nhiều hóa đơn theo đợt trên cùng một PO

Nghiệm thu ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79 với hai Gmail loopback. Kịch bản
giả lập nhà cung cấp, kho, Mua hàng và kế toán dưới quyền chủ hồ sơ.

Kho nhận 90 bộ B. Duyệt đợt 60 để lại 30. Đợt 50 bị chặn dù bản
xem trước cũ còn hiển thị đủ hàng. Ask Inbox dẫn về phiếu kho và
đợt đã duyệt. Kho bổ sung 10 và hóa đơn đính chính còn 40. Gửi lại
dưới tên khác bị từ chối. Mất phản hồi sau khi duyệt và thử lại
trả cùng ID, tổng 100. Kho đính chính thực nhận xuống 99 tạo cảnh
báo vượt 1. Bản thay thế của đợt đầu giữ 60 đến khi duyệt số mới 59.
Hai yêu cầu duyệt đồng thời cùng dựa vào 90 bộ ở dòng A cho kết
quả một thành công và một xung đột. Kịch bản ghi nhận 0 email gửi.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-installments` và build Next production | Exit 0. 22 kiểm tra. Bốn ảnh Chrome qua axe và không tràn ngang |
| Lint và TypeScript | Exit 0. Lint có 92 cảnh báo hiện có |
| Unit và integration | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 39 nhóm, gồm nâng cấp chuỗi hóa đơn cũ và giữ số đã duyệt |
| Hồi quy đối soát một hóa đơn và phiếu nhập CSV | Exit 0. 20 và 20 kiểm tra |
| Design và platform biệt lập | Exit 0. 29 và 19 kiểm tra |
| Staging biệt lập | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục |

[Phạm vi và cách chạy lại](PURCHASE_INSTALLMENTS.md) · [Báo cáo Chrome](../../test-results/purchase-installments/report.json).

## Đối soát ba bên trước thanh toán

Nghiệm thu ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail loopback cho Mua hàng và
Kho. Các vai nhà cung cấp, kho, người mua và kế toán đều giả lập.

Dòng A báo sai đơn giá và dòng B tính tiền 100 bộ khi mới nhận 90.
Action Inbox dẫn đến hóa đơn bị giữ. Ask Inbox dẫn đúng dòng và tệp của
ba nguồn. Bản gửi lại dưới tên khác không ghi thêm chứng từ. Phiếu bổ
sung đồng bộ muộn giải quyết thiếu hàng. Sau khi hóa đơn đính chính đúng
giá, kế toán duyệt tổng trước thuế 2.000.000 đồng. Tệp thay đổi sau xem
trước bị từ chối. Mất phản hồi sau ghi và thử lại trả cùng một biên
nhận. Đính chính kho sau duyệt làm bộ chứng từ lệch và gỡ trạng thái
đủ căn cứ. Kịch bản ghi nhận 0 lần gửi email.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-payment` và build Next production | Exit 0. 20 kiểm tra. Bốn ảnh Chrome qua axe và kiểm tra không tràn ngang |
| Lint và TypeScript | Exit 0. Lint có 92 cảnh báo hiện có |
| Unit và integration | Exit 0. 252 và 200 test |
| `npm run test:db` | Exit 0. 38 nhóm, gồm chặn duyệt khi thiếu kho, khóa yêu cầu, cách ly RPC và vô hiệu chứng cứ đã đổi |
| Hồi quy phiếu nhập CSV và Ask Inbox biệt lập | Exit 0. 20 và 25 kiểm tra |
| Design và platform biệt lập | Exit 0. 29 và 19 kiểm tra |
| Staging biệt lập | Exit 0. 31 kiểm tra nâng cấp, sao lưu và phục hồi |

[Phạm vi và cách chạy lại](PURCHASE_PAYMENT.md) · [Báo cáo Chrome](../../test-results/purchase-payment/report.json).

## Đối soát phiếu nhập từ tệp CSV đính kèm

Ngày 14/11/2026. macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail loopback và ba vai
giả lập gồm Mua hàng, nhà cung cấp và Kho.

Chrome mở tệp đúng hộp thư dù trùng tên, chặn ghi nếu byte trên Gmail
thay đổi sau khi xem trước, đối chiếu A 110 và B 90,
sau đó ghi cả phiếu bằng một phiên bản. Khi mất phản hồi sau ghi,
thử lại trả cùng biên nhận. Tệp thiếu mã dòng và bản gửi lại dưới
tên mới đều giữ nguyên số liệu. Ask Inbox dẫn đúng tệp và hàng
chứng từ. Sau khi duyệt đính chính A và phiếu bổ sung B đến muộn,
người mua xem bằng chứng rồi khép đơn trên Chrome mobile.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run lint` và `npm run typecheck` | Exit 0. Lint có 92 cảnh báo, không có lỗi |
| `npm run test:unit` và `npm run test:integration` | Exit 0. 251 và 200 test |
| `npm run test:db` | Exit 0. 37 nhóm, gồm giao dịch ghi cùng lúc bốn dòng, quyền RPC, thay đổi chứng cứ và thử lại |
| `npm run test:purchase-csv` và build Next production | Exit 0. 20 kiểm tra và bốn màn hình Chrome qua axe, không tràn ngang |
| `npm run test:multiline-purchase` | Exit 0. 20 kiểm tra hồi quy Cam kết theo nội dung email |
| `npm run test:mail-lookup` | Exit 0. 22 kiểm tra tìm thư và tải đúng tệp |
| `npm run test:design -- --isolated` | Exit 0. 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0. 19 kiểm tra trình duyệt |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và phục hồi local |

[Phạm vi và cách chạy lại](PURCHASE_CSV.md) · [Báo cáo Chrome](../../test-results/purchase-csv/report.json).

## Đối soát đơn mua hàng nhiều dòng

Nghiệm thu ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
PostgreSQL 16 và Chrome 157.0.8103.79. Hai Gmail loopback tách vai Mua hàng
và Kỹ thuật. PO giả lập có A và B cùng đặt 100 bộ. Cùng một phiếu báo thực nhận
A 110 và B 90. Sổ giữ riêng chênh lệch, từ chối khép theo tổng, và giữ nguyên
số lượng khi phiếu thiếu mã, ghi mã mơ hồ hoặc gửi lại. Action Inbox chỉ gửi
một lời nhắc dòng B sau khi duyệt. Ask Inbox mở đúng email nguồn và báo thiếu
bằng chứng nếu giới hạn hộp thư. Sau khi duyệt đính chính A và phiếu B đến
muộn, đơn khép ở phiên bản 9. Hai lần mất phản hồi HTTP sau lưu (phiếu và
khép) đều trả về bản ghi đã lưu khi người mua thử lại cùng khóa.

| Kiểm tra | Kết quả local |
| --- | --- |
| Lint, TypeScript | Exit 0, lint có 92 cảnh báo hiện có |
| Unit và integration | Exit 0, 251 và 200 test |
| PostgreSQL `npm run test:db` | Exit 0, 36 nhóm. Có kiểm tra quyền RPC, bằng chứng đã thay đổi, chặn đường ghi chung và chống lặp |
| Build Next production và `npm run test:multiline-purchase` | Exit 0, 20 kiểm tra. Bốn ảnh qua axe và không tràn ngang. Nút duyệt khép thấy ngay ở 390 × 844 |
| `npm run test:warehouse-correction` | Exit 0, 23 kiểm tra hồi quy luồng một dòng |
| `npm run test:design -- --isolated` | Exit 0, 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0, 19 kiểm tra trình duyệt |
| `npm run test:staging -- --isolated` | Exit 0, 31 kiểm tra nâng cấp, sao lưu, khôi phục và cảnh báo local |

[Phạm vi và cách chạy lại](MULTILINE_PURCHASE.md) · [Báo cáo Chrome](../../test-results/multiline-purchase/report.json).

## Điều chỉnh phiếu nhập và mở lại cam kết

Nghiệm thu ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Chrome
157.0.8103.79, Next.js 16.4.6 và PostgreSQL 16. Chrome đóng vai người mua,
nhà cung cấp và kho sử dụng hai Gmail loopback. PO đã khép với 200 bộ.
Bản xem trước đính chính dẫn phiếu gốc và cho thấy tổng thực nhận giảm
xuống 190. Bản ghi 7 mở lại cam kết. Khi mất phản hồi HTTP, thử lại trả
về chính bản ghi 7. Đính chính gửi trùng, sai người gửi, sai hộp thư và
đính chính cũ đến muộn giữ nguyên phiên bản. Người mua duyệt lời nhắc
thiếu 10 bộ, ghi phiếu nhận hàng thay thế và duyệt khép ở phiên bản 9.

| Kiểm tra | Kết quả local |
| --- | --- |
| `npm run lint` | Exit 0, 92 cảnh báo hiện có |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` và `npm run test:integration` | Exit 0, 251 và 200 test |
| `npm run test:db` | Exit 0, 35 nhóm. Bao gồm giả mạo dấu nguồn, sửa phiếu gốc sau khi xem, cập nhật hai lần cùng phiếu và quyền tenant |
| Build Next production | Exit 0 với cấu hình giả lập trong lượt Chrome |
| `npm run test:warehouse-correction` | Exit 0, 23 kiểm tra. Bảy màn hình Chrome desktop và mobile đạt axe và không tràn ngang |
| `npm run test:delivery-commitments` | Exit 0, 18 kiểm tra hồi quy giao hàng |
| `npm run test:design -- --isolated` | Exit 0, 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0, 19 kiểm tra. Inbox 600 thư, hàng đầu tiên 1,00–1,12 giây |
| `npm run test:staging -- --isolated` | Exit 0, 31 kiểm tra nâng cấp, sao lưu, phục hồi và cảnh báo local |

[Phạm vi, kịch bản và lệnh chạy lại](WAREHOUSE_RECEIPT_CORRECTION.md).

## Đối soát giao hàng và xác nhận nhập kho

Kiểm tra ngày 14/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79 và PostgreSQL 16. Hai Gmail loopback tách riêng Mua hàng
và Kỹ thuật. Kịch bản đóng vai người mua, nhà cung cấp và nhân viên kho.

Nhà cung cấp báo đã giao 200 bộ và kho ghi nhận 180. Phiếu trùng, sai đơn vị
và sai người gửi không thay đổi sổ. Chrome thử lại phê duyệt với đúng mã sau
khi biên nhận HTTP bị mất ở cả lần ghi phiếu đầu và lần khép. Mỗi lần
chỉ ghi một phiên bản. Action Inbox
hiển thị thiếu 20 bộ, cho xem trước lời nhắc và chỉ gửi một lần qua Gmail
giả lập. Ask Inbox dẫn cả hai nguồn và từ chối kết luận nếu bộ lọc ẩn một
nguồn. Phiếu độc lập 20 bộ có thời điểm cũ hơn được duyệt sau, sau đó người
mua xem bằng chứng và xác nhận khép. Phiên khác nhận 404 khi mở yêu cầu duyệt.

| Kiểm tra | Kết quả local |
| --- | --- |
| `npm run lint` | Exit 0, 92 cảnh báo hiện có |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` và `npm run test:integration` | Exit 0, 250 và 200 test |
| Build Next production | Exit 0 trong các lượt Chrome và staging, dùng cấu hình local giả lập |
| `npm run test:db` | Exit 0, 35 nhóm, gồm sai nguồn, chống duyệt lặp và nguồn bị sửa |
| `npm run test:warehouse-reconciliation` | Exit 0, 19 kiểm tra gồm 14 kiểm tra Auth chung. Bốn ảnh ở desktop và mobile có 0 vi phạm axe và không tràn ngang |
| `npm run test:delivery-commitments` | Exit 0, 18 kiểm tra hồi quy milestone trước |
| `npm run test:design -- --isolated` | Exit 0, 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0, 19 kiểm tra. Inbox 600 thư, hàng đầu tiên 1,19–1,44 giây |
| `npm run test:staging -- --isolated` | Exit 0, 31 kiểm tra nâng cấp, sao lưu và phục hồi local |

Bộ nhận diện chỉ xử lý phiếu văn bản trong email cho một dòng hàng mỗi PO,
với nguồn kho đã được cấu hình. Nghiệm thu dùng dữ liệu giả lập và không đo
thời gian người dùng, xác thực vật lý hàng hóa hoặc khả năng đọc chứng từ
đính kèm. [Phạm vi và cách chạy lại](WAREHOUSE_RECONCILIATION.md).

## Theo dõi cam kết giao hàng

Nghiệm thu ngày 13/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79 và PostgreSQL 16. Chrome đóng vai người mua hàng đi từ
đề nghị đổi lịch đến giao đủ, mở chứng cứ từ hai Gmail giả lập và kiểm tra
Ask Inbox. Phát lại lần lưu bị mất phản hồi giữ đúng một phiên bản. Lời
nhắc quá hạn được duyệt trên Chrome và chỉ gửi một lần về Gmail giả lập
khi phát lại cùng yêu cầu. Phiên khác nhận 404 khi mở cam kết của người mua.

| Kiểm tra | Kết quả local |
| --- | --- |
| `npm run lint` | Exit 0, 92 cảnh báo hiện có |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` và `npm run test:integration` | Exit 0, 246 và 200 test |
| `npm run test:db` | Exit 0, 34 nhóm. Chặn xác nhận sai hạn, giao đủ khi nguồn báo một phần và sửa trực tiếp các điều khoản giao |
| `npm run build` | Exit 0, build Next production với biến giả lập. Cảnh báo Sentry hiện có |
| `npm run test:delivery-commitments` | Exit 0, 18 kiểm tra gồm 14 kiểm tra Auth chung. Năm ảnh chụp có 0 lỗi axe và không tràn ngang |
| `npm run test:design -- --isolated` | Exit 0, 29 kiểm tra |
| `npm run test:platform -- --isolated` | Exit 0, 19 kiểm tra. Inbox 600 thư, hàng đầu tiên 1,11–1,48 giây ở ba kích thước Chrome |
| `npm run test:staging -- --isolated` | Exit 0, 31 kiểm tra nâng cấp, phục hồi và cảnh báo local |
| Bộ đo giao hàng | InboxAI khớp 24/24 quyết định, giữ nguyên văn nguồn ở 19/19 phiên bản được xác nhận. Codex đóng vai đọc thủ công 24/24, LLM trực tiếp 19/24, agent đọc thư 20/24 |

Lần chạy Chrome trước đó phát hiện tiêu đề thư chung có thể lấp dẫn chứng
đề nghị dời lịch trong Ask Inbox. Ca hồi quy đi qua sau khi sửa. Lần chạy
gửi thử bị Gmail giả lập từ chối do fixture chỉ chấp nhận miền chính xác
`example.test`. Đã sửa địa chỉ thử và chạy lại trọn luồng.

Tất cả email và người dùng là giả lập. Số đo phản ánh bộ thư do Codex soạn
và khóa nhãn trước khi sửa bộ phát hiện. Chưa đo thời gian đọc của con người,
độ chính xác trên thư độc lập, xác nhận nhập kho hay tương thích Gmail thật.
[Phạm vi, bộ đo và cách chạy lại](DELIVERY_COMMITMENTS.md).

## Offline compose and attachments

Choose **Bật lưu bản nháp trên thiết bị** while connected to enroll or unlock
the vault and save the current message. After the first setup, **Soạn thư trên
thiết bị** in the offline workspace also starts a new message without a
connection. The installed service worker serves the workspace shell on
network failure. Its cache contains only static assets.

The vault encrypts recipients, sender choices, source and revision, body,
attachment metadata, and attachment bytes. Attachment bytes occupy separate
encrypted records. Changes to those records and the manifest commit in one
IndexedDB transaction. The device allows up to five files and 8 MiB per
draft, with a 32 MiB attachment budget per browser profile. Existing reply
and pinned-mail records remain readable after the IndexedDB schema upgrade.

After reconnecting, **Kiểm tra và đồng bộ** uses the saved server revision.
A divergence shows both versions and waits for the user's choice. Browser
retries use the same upload and creation IDs. The server checks the current
session against the device owner, and a sync keeps its pending write until
the server acknowledges it. Sending still requires the separate approval
step. Signing out clears the local vault and locks open offline tabs.

The synthetic run used desktop and mobile Chrome, two loopback Gmail
accounts, three cold browser restarts, and two separate browser profiles.
Two equal-name files were recovered byte-for-byte while offline. The
scenario also verified a forward's source, upload and creation response
loss, user isolation, and one approved Gmail dispatch. The two captured
views had zero axe violations and no horizontal overflow.

Use the offline workspace to manage device copies. Uploaded attachments
remain subject to the existing server attachment lifecycle. Drafts must
show **Đã lưu trên thiết bị** before closing Chrome. Browser storage
deletion removes local copies. Verification used loopback synthetic mail
and browser viewports.

The tests ran on 2026-11-13 with Chrome 157.0.8103.79, Node 24.14.1,
Next.js 16.4.6 and local PostgreSQL 16 on macOS arm64.

| Command | Local result |
| --- | --- |
| `npm run lint` | Exit 0 with 92 existing warnings |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` and `npm run test:integration` | Exit 0 with 245 and 200 tests |
| `npm run test:db` | Exit 0 with 33 checks |
| `npm run test:draft-continuity` | Exit 0 with 21 checks |
| `npm run test:design -- --isolated` | Exit 0 with 29 checks |
| `npm run test:platform -- --isolated` | Exit 0 with 19 checks |
| `npm run test:staging -- --isolated` | Exit 0 with 31 checks |
| `npm run test:offline-compose` | Exit 0 with 21 checks including a v1 IndexedDB upgrade and session switch |
| `npm run test:offline-reply` | Exit 0 with 20 checks after updating the cache assertion to check the exact static asset list |
| `npm run build` | Exit 0 with the synthetic CI configuration and isolated build output |

[Chrome report](../../test-results/offline-compose/report.json) ·
[Workflow details](../../test-results/offline-compose/workflow.json) ·
[Offline recovery](../../test-results/offline-compose/01-khoi-phuc-ngoai-tuyen.png) ·
[Version comparison](../../test-results/offline-compose/02-doi-chieu-sau-ket-noi.png)

## Cross-device draft continuity

The Bản nháp folder lists server-backed new messages, replies and forwards
with sending-account filters and a recency cursor. Scheduled mail stays in
Chờ gửi. Pending sends can be reopened to verify the original receipt.
The editors save after 1.1 seconds of inactivity and report when a change
still needs to sync. Autosave does not approve or send mail.

The first save of a new message or forward uses a tenant-scoped creation
key. A replay returns the same draft and a discarded key cannot recreate it.
Subsequent saves check the draft revision. On conflict the editor keeps
both copies visible, including their attachment manifests, until the user
selects a version. The existing opt-in encrypted offline reply still
supports reopening without a connection. New messages, forwards and
attachment changes need a server acknowledgement before they are safe to
reopen after closing the tab.

On 2026-11-13, the synthetic rehearsal ran with Chrome 157.0.8103.79,
Next.js 16.4.6, Node 24.14.1 and PostgreSQL 16 on macOS arm64. Independent
Chrome profiles reopened the exact sender, To, Cc, subject, body and file.
An offline edit and a simultaneous online edit preserved both versions.
The approved message and exact attachment were dispatched once after
losing the Gmail acknowledgement and the browser response. A second
InboxAI user could open only their own pre-migration draft. The three
captured surfaces had zero axe violations and no horizontal overflow.

| Command | Local result |
| --- | --- |
| `npm run lint` | Exit 0 with 92 existing warnings |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` and `npm run test:integration` | Exit 0 with 245 unit tests and 200 integration tests |
| `npm run test:db` | Exit 0 with 32 SQL checks, including creation replay, attachment conflicts and tenant isolation |
| `npm run test:design -- --isolated` | Exit 0 with 29 checks |
| `npm run test:platform -- --isolated` | Exit 0 with 19 checks across desktop, tablet and mobile Chrome |
| `npm run test:staging -- --isolated` | Exit 0 with 31 checks including migration, backup and restore |
| `npm run test:offline-reply` | Exit 0 with 20 checks on rerun. One initial run stopped at the shared PostgREST RLS assertion before Chrome opened. |
| `npm run test:compose-attachments` | Exit 0 with 21 checks, including byte-for-byte Sent downloads |
| `npm run test:scheduled-send` | Exit 0 with 21 checks, including scheduled sends and cancellation on mobile |
| `npm run test:draft-continuity` | Exit 0 with 21 checks including the shared Auth checks |
| `npm run build` | Exit 0 with synthetic CI configuration and the isolated build directory |

[Chrome report](../../test-results/draft-continuity/report.json) ·
[Workflow evidence](../../test-results/draft-continuity/workflow.json) ·
[Draft folder](../../test-results/draft-continuity/03-danh-sach-ban-nhap.png) ·
[Mobile conflict](../../test-results/draft-continuity/02-doi-chieu-hai-ban.png)

## Recipient suggestions and sending identity

Compose, Reply and Forward share a keyboard-accessible recipient picker for
To and Cc. It searches up to 160 recent visible outbound messages from the
selected sending account and ranks by frequency and recency. It returns up
to eight addresses, with the full address shown even when names collide.
When Sent contains only an address, an inbound message in the same account
can supply the display name. The lookup uses synchronized mail and supports
Vietnamese names with and without diacritics. Manual address entry remains
available.

Changing the sending account keeps the entered addresses and shows a review
notice. Every new message now uses the existing server draft and approval
flow. The preview displays the saved sender, recipients and content.
Approval binds those fields to that draft revision. An uncertain send resumes by draft ID and checks the
same receipt. When the earlier composer left a matching receipt key in the
tab, the new composer checks it without requesting a second dispatch.

The synthetic Chrome scenario used two loopback Gmail accounts and two
InboxAI users. It distinguished matching Vietnamese names by their full
addresses, kept To while switching accounts and checked Cc against the
new account. Chrome and Next restarted before verifying the saved From,
To and Cc. Both the Gmail acknowledgement and the browser response were
dropped. The same receipt was recovered with one provider dispatch and
one Sent row. The second user could not retrieve either mailbox's
suggestions or read the original draft.

On 2026-11-13, `npm run test:compose-recipients` exited 0 with 20
checks in Chrome 157, with the local Next.js 16.4.6 production-mode
build, Node 24.14.1 and PostgreSQL 16 on macOS arm64. Desktop keyboard
and mobile touch selection worked. The three captured views had zero
axe violations or horizontal overflow. TypeScript, 245 unit tests,
200 integration tests and 31 SQL checks passed. Lint reported 92 warnings
and zero errors. The design, platform, staging, compose attachments,
offline reply, scheduled send and full purchasing/security browser
runs passed 29, 19, 31, 21, 20, 21 and 41 checks respectively.

[Chrome checks](../../test-results/compose-recipients/report.json) ·
[Workflow evidence](../../test-results/compose-recipients/workflow.json) ·
[Two people with the same name](../../test-results/compose-recipients/01-nguoi-trung-ten.png) ·
[Recovered draft](../../test-results/compose-recipients/02-ban-nhap-khoi-phuc.png)

## Actionable notifications

The Inbox and dashboard bell open a list of current work from tracked
replies, due follow-ups, the commitment ledger and Gmail reconnect state.
Each item links to the corresponding email, review, follow-up or OAuth
flow. Viewing records an owner-scoped receipt. Resolving the work updates
the original workflow and removes the item from the next list. A new
Gmail revocation receives a fresh notification identity. The list reuses
the existing bounded reply and commitment views and opens in the web app.

The Chrome journey closes the browser before background sync, injects a
reply and a proposed deadline change, advances the follow-up date, and
revokes one of the two loopback Gmail accounts. After a restart, it
checks four actionable items and excludes 48 promotional emails. It
drops the mark-seen acknowledgement after the database commits, then
reloads and syncs again. The same four IDs and one view receipt survive.
The journey follows the source links, resolves the reply, reschedules
the follow-up, approves the ledger revision, reconnects Gmail and
switches to a second InboxAI user in the same Chrome context.

On 2026-11-13, `npm run test:action-notifications` passed 20 checks in
Chrome 157 on macOS arm64 with Node 24.14.1, PostgreSQL 16 and the
local production-mode Next.js 16.4.6 build. The flow recorded zero
additional Gmail dispatches, no page errors, and no axe violations or
horizontal overflow on the three captured screens. Lint exited 0
with 91 existing warnings. TypeScript, 245 unit tests, 200 integration
tests and 30 SQL checks passed. The isolated design and platform runs
passed 29 and 19 checks. Isolated staging passed 31 checks, including
backup and restore. The reply-followup and reply-workflow regressions
passed 20 and 23 checks.

[Chrome checks](../../test-results/action-notifications/report.json) ·
[Workflow evidence](../../test-results/action-notifications/workflow.json) ·
[Desktop](../../test-results/action-notifications/01-reopen.png) ·
[Seen and still actionable](../../test-results/action-notifications/02-seen-still-open.png) ·
[Mobile](../../test-results/action-notifications/03-mobile.png)

## GitHub Actions attachment authorization regression

The GitHub Actions run for `82c7a46` passed seven of eight jobs. The
local Auth rehearsal expected an English error for a cross-tenant source
account after the attachment endpoint began returning the Vietnamese
message. The rehearsal now asserts both the HTTP 400 and the current
message. [Original CI run](https://github.com/nclamvn/inboxai-public/actions/runs/43218515860)

On 2026-11-12, `npm run test:local-auth -- --isolated-auth` exited 0
with 88 checks and a production-mode Next.js build on macOS arm64 with
Node 24.14.1 and PostgreSQL 16. The isolated option reuses the alternate
loopback ports so the rehearsal can run alongside an existing local
session. Lint and TypeScript exited 0, with 91 existing lint warnings.
All 245 unit tests, 200 integration tests and 29 SQL checks passed.
[Local Auth report](../../test-results/local-auth/report.json)

## Offline reading and reply recovery

On 2026-11-12, `npm run test:offline-reply` exited 0 with 20 checks
using Chrome 157 and PostgreSQL 16. The scenario used two loopback Gmail
accounts with the same message ID and subject. It saved one email explicitly,
edited its reply with the network disabled, closed Chrome and reopened the same browser
profile while still offline. The correct passphrase recovered the selected
email and reply. The other account's email stayed outside the offline store.
The browser cached only the static shell. The device stored mail and draft
content in an authenticated, encrypted IndexedDB vault scoped to one user.

On reconnect, Chrome displayed the divergent device and server drafts side
by side. Selecting the device version left the server unchanged until the
user opened the send preview. Gmail received zero sends before approval.
The Gmail fixture accepted one reply from the selected account. After the
provider acknowledgement and browser response were both dropped, verification
recovered the same receipt and replay issued no second dispatch. Signing out
locked the open offline tab and cleared the stored copies. A second admitted
InboxAI user could not reopen the previous user's draft or read its API data.
Three sampled screens had zero axe violations or horizontal overflow. The
final Chrome run recorded no uncaught page errors.

Offline coverage includes saved email text and reply text with To and Cc.
Attachments are available online. Each browser restart requires the separate
offline passphrase. The server reply workflow owns preview, approval and
dispatch. This milestone adds no database migration.

`npm run lint` exited 0 with 91 existing warnings. `npm run typecheck`,
`npm run test:unit` (245 tests), `npm run test:integration` (200 tests),
`npm run test:db` (29 SQL checks), and the local Next.js 16.4.6
production-mode build passed on macOS arm64 with Node 24.14.1.
`npm run test:design -- --isolated` and
`npm run test:platform -- --isolated` passed 29 and 19 checks.
`npm run test:staging -- --isolated` and `npm run test:reply-workflow`
passed 31 and 23 checks.

[Chrome checks](../../test-results/offline-reply/report.json) ·
[Workflow evidence](../../test-results/offline-reply/workflow.json) ·
[Recovered email and draft](../../test-results/offline-reply/01-offline-after-restart.png) ·
[Draft comparison](../../test-results/offline-reply/02-conflict.png) ·
[Send receipt](../../test-results/offline-reply/03-sent-once.png)

## Search across synced mail and attachments

On 2026-11-12, `npm run test:mail-lookup` passed 22 checks with Chrome
157, Node 24.14.1, PostgreSQL 16 and a production-mode Next.js 16.4.6
build on macOS arm64. Two Gmail accounts on loopback delivered 220
messages. Both target emails had 218 newer messages ahead of them.
The primary search found the older subject without accents. A filename shared by the two
accounts yielded two downloads with different verified bytes. Opening
the exact source, downloading and returning preserved the query,
mailbox, attachment filter and manual category. Chrome went offline
during a new search and restored the same results on retry. Pagination
returned all 24 tied timestamps exactly once. Foreign account filters,
foreign attachment downloads and deleted search matches were rejected.
The mobile reader returned to the same query. Three sampled screens had
zero axe violations or horizontal overflow. The fixture made no
provider label changes or sends.

The search covers synchronized, non-deleted mail and matches attachment
names, subject, sender and indexed body text. The filename index uses
PostgreSQL `pg_trgm`. Ask Inbox continues to provide its own search and
answer workflow. SQL covered the stored Sent file ID, mirrored
attachment deduplication, literal percent signs, effective category and
ownership boundaries.

Lint, TypeScript, 241 unit tests, 200 integration tests, 29 SQL checks
and the local production build passed. Lint reported 91 existing warnings.
Design, platform, local staging and Action Inbox passed 29, 19, 31
and 42 checks respectively.
[Chrome report](../../test-results/mail-lookup/report.json) ·
[Workflow and download hashes](../../test-results/mail-lookup/workflow.json)

## Personal sender rules

On 2026-11-12, `npm run test:personal-mail-rules` passed 22 checks on
macOS arm64 with Chrome 157, Node 24.14.1, PostgreSQL 16 and a
production-mode Next.js 16.4.6 build. Two Gmail fixtures on loopback
delivered 112 initial messages and 118 by the end. Preview found a match
outside the Inbox page without writing a rule. A new matching message
invalidated that preview. Confirmation survived response loss, and a
restart and Gmail history replay preserved unique emails and labels.
The same sender and Gmail message ID in another account remained scoped
to that account. Urgent alerts stayed visible alongside promotion labels.
Undo survived response loss, removed six rule labels, preserved one manual
correction and stopped applying the rule to new arrivals. Mobile verified
a future-only rule. Four sampled screens passed axe and overflow checks.
The Gmail fixture received zero label modifications or sends.

From the Inbox reader, open **Đổi nhãn**, choose a label, and save the
single email or preview a sender rule. The preview can include up to 200
existing eligible Inbox emails. **Quy tắc** in the Inbox opens the undo
receipt. A rule uses the exact normalized sender address in one Gmail
account. Rule labels are local to InboxAI and leave the automatic
classification available for undo. A same-label manual choice is still a
manual correction. SQL also verified tenant isolation and restoration of
a baseline changed after confirmation.

Lint, TypeScript, 241 unit tests, 200 integration tests, 28 SQL checks and
the local production build passed. Lint reported 91 existing warnings.
Design, platform, local staging and Action Inbox regressions passed 29,
19, 31 and 42 checks respectively.
[Chrome report](../../test-results/personal-mail-rules/report.json) ·
[Workflow evidence](../../test-results/personal-mail-rules/workflow.json)

## Message category and priority colors

On 2026-11-12, `npm run test:design -- --isolated` passed 29 checks in
Chrome 157 with synthetic email and a production-mode Next.js 16.4.6
build. Desktop, tablet, mobile and dark Inbox displayed five distinct
label fills for important, urgent, transaction, promotion and newsletter
mail. The 20 sampled label pairs measured 5.78:1 to 8.37:1 contrast.
An abnormal transaction displayed both its category and urgency, while
the routine receipt retained only its category. Split reading kept both
labels visible. The sampled views had no axe violations or horizontal
overflow. [Chrome design evidence](../../test-results/m6d/design/browser.json)

Lint, TypeScript, 241 unit tests, 200 integration tests and the
production build passed on macOS arm64 with Node 24.14.1. Lint reported
91 existing warnings. The platform suite passed 19 checks. The
conversation regression passed 29 checks after preserving toolbar
label contrast during loading, with one dispatch and one Sent row
after lost acknowledgement and a restart.

## Inbox and Sent conversation reader

On 2026-11-12, `npm run test:inbox-conversation` passed 29 local Chrome
checks with two loopback Gmail accounts, PostgreSQL 16 and a production-mode
Next.js 16.4.6 build on macOS arm64 and Node 24.14.1. Matching subjects and
Gmail thread IDs stayed separate across accounts. An accepted outbound
reply appeared in Sent and the same conversation before the next Gmail
history sync. After provider and browser acknowledgements were dropped,
a Next restart and replay recovered one receipt, one provider dispatch
and one Sent row. The commitment links opened both the newer reply and
the earlier source, retaining the selected message. A 26-message fixture
verified paging, a pinned older source and denied access for foreign
and anonymous readers. Chrome sampled nine screens across desktop, tablet and mobile with
zero axe violations, page errors and horizontal overflow. The mobile
reader retained the selected source while navigating the conversation.

Lint, TypeScript, 241 unit tests, 200 integration tests, and 27 SQL checks
passed. Lint reported 91 existing warnings. The design, platform, reply
workflow and local staging suites passed 25, 19, 23 and 31 checks.
[Local conversation handoff](INBOX_CONVERSATION_LOCAL_HANDOFF.md) ·
[Chrome report](../../test-results/inbox-conversation/report.json)

## Workspace color and status cues

On 2026-11-12, local Chrome with synthetic data verified the selected
navigation tint and 2px indicator on desktop, tablet, mobile and dark
Inbox. Navy marks priority and navigation. Amber identifies pending
work, red indicates a failure or connection that requires attention,
green indicates confirmation, and teal distinguishes transaction mail.
State labels remain visible. The ten sampled foreground/background token
pairs had calculated contrast ratios from 6.13:1 to 8.13:1.

Local production-mode builds, lint, TypeScript, 241 unit and 200
integration tests passed on macOS arm64 with Node 24.14.1 and Next.js
16.4.6. Lint reported 91 existing warnings. The design, platform, Gmail
reconnect, scheduled send and local staging suites passed 25, 19, 20,
21 and 31 checks.
Chrome sampled light and dark Outbox states with zero axe violations
or horizontal overflow.
[Inbox design evidence](../../test-results/m6d/design/browser.json) ·
[Outbox dark](../../test-results/scheduled-send/04-trang-thai-mobile-toi.png)

## Gmail reconnection and catch-up

On 2026-11-12, `npm run test:gmail-reconnect` passed 20 checks on macOS
arm64 with Node 24.14.1, Chrome 157, PostgreSQL 16 and a local production-mode
Next.js build. Independent workers ran on loopback with two synthetic Gmail
accounts. Background sync ingested both accounts while Chrome was closed.
A transient failure preserved the checkpoint and retried. A revoked refresh
grant suspended only the affected account and blocked scheduled mail before
dispatch. Selecting the other mailbox or a mismatched Google subject changed
neither credential. Correct consent preserved the account ID and checkpoint,
retrieved missing mail without a full resync or duplicate, and opened the
exact cited commitment reply. Two Next restarts preserved progress. After
Gmail accepted a resumed scheduled send and dropped the acknowledgement,
the worker found the same Message-ID in Sent. The fixture observed one
provider send and one durable receipt. Five sampled screens had no axe
violations or horizontal overflow.

Lint, TypeScript, 241 unit tests, 200 integration tests and 26 SQL checks
passed. Lint reported 91 existing warnings. SQL verified that stale
authorization could neither replace the grant nor let an old sync worker
alter the retained checkpoint. Design, platform and local staging passed
25, 19 and 31 checks. The general E2E, scheduled send and Inbox catch-up
regressions passed 41, 21 and 24 checks. The general E2E confirmed that
the existing Settings read consent also restores sync after revocation.
The loopback worker rejected a non-local destination before connecting.
See the [local Gmail reconnect handoff](GMAIL_RECONNECT_LOCAL_HANDOFF.md) and
[Chrome results](../../test-results/gmail-reconnect/report.json).

## Scheduled Gmail send

On 2026-11-12, `npm run test:scheduled-send` passed 21 local checks on macOS
arm64, Node 24.14.1, Next.js 16.4.6, Chrome 157 and PostgreSQL 16. The test used
production-mode Next, two loopback Gmail accounts and controlled browser and
database clocks. Of three approved schedules, two dispatched with Chrome
closed and one was cancelled and reopened as an editable draft. No send
started before its due time. A lost browser acknowledgement replayed the
same approval. Two worker processes competed for a single job. After Gmail
accepted it and dropped the response, the next worker found the same
Message-ID in Sent after a Next restart. The provider recorded exactly two
send calls, with the expected Gmail reply thread and attachment bytes.
Three sampled screens had no axe violations or horizontal overflow. SQL
covered the expired-worker lease and cross-tenant and premature-send fences.

Lint, TypeScript, 241 unit tests, 199 integration tests, 25 SQL checks and
the local production-mode build exited 0. Lint reported 91 existing warnings.
Design, platform and local staging passed 25, 19 and 31 checks.
The attachment, reply and Inbox snooze regressions passed 21, 23 and 20 checks.
The loopback worker rejected a non-local destination before connecting. See the
[local scheduled-send handoff](SCHEDULED_SEND_LOCAL_HANDOFF.md) and
[Chrome results](../../test-results/scheduled-send/report.json).

## Email snooze and scheduled Inbox return

On 2026-11-12, `npm run test:email-snoozes` exited 0 on macOS arm64 with
Node 24.14.1, Next.js 16.4.6, Chrome 157 and PostgreSQL 16. The production-mode
build and 20 browser/Auth checks used two loopback Gmail accounts with
matching subject and provider message ID. Cancellation restored only the
selected message. After a move lost its browser acknowledgement, a Next
restart preserved the new deadline and version. At the database deadline,
the open mobile Inbox returned the older message once on its first page.
The Gmail-archived message stayed out. The run recorded zero provider
writes or sends, and sampled desktop and mobile screens had zero axe
violations. PostgreSQL verified replay, stale cancellation and exact
deadline visibility.

Lint exited 0 with 91 existing warnings. TypeScript, 241 unit tests, 199
integration tests and 24 SQL checks passed. Design, platform, Gmail triage,
E2E and staging exited 0 with 25, 19, 25, 41 and 31 checks. See the
[email snooze handoff](EMAIL_SNOOZES_LOCAL_HANDOFF.md) for local commands and
browser evidence.

## Bidirectional Gmail Inbox triage and undo

On 2026-11-12, `npm run test:gmail-triage` exited 0 on macOS arm64 with
Node 24.14.1, Next.js 16.4.6, Chrome 157 and PostgreSQL 16. A production-mode
build and 25 browser/Auth checks passed using two loopback Gmail accounts.
An archive affected the two selected messages even though the provider IDs
were identical. After both acknowledgements were dropped and Next restarted,
read-back verified the second archive with zero additional Gmail writes.
After an external label changed away and back, undo rejected that message
and restored the other. Label history from Gmail also refreshed InboxAI.
The sampled desktop and mobile screens had zero axe violations.

Lint exited 0 with 91 existing warnings. TypeScript, 241 unit tests, 199
integration tests and 23 SQL checks passed. The design, platform, attachment,
general E2E and staging suites exited 0 with 25, 19, 21, 41 and 31 checks.
See the [Gmail triage handoff](GMAIL_TRIAGE_LOCAL_HANDOFF.md) for commands,
local evidence and the limits of provider verification.

## Compose, reply and forward attachments

On 2026-11-12 on macOS 27.2 arm64, Node 24.14.1, Chrome 157 and Next.js
16.4.6, `npm run test:compose-attachments` exited 0 with a production-mode
build and 21 browser/Auth checks. Two loopback Gmail accounts sent three
messages. Browser downloads from Sent matched all three original byte
sequences after sync. Forwarding selected only the second of two equal-name
and equal-size attachments, and approval of an edited selection was denied.
Losing both acknowledgements and restarting Next preserved one dispatch
for the forwarded message. Anonymous and foreign tenant download probes
were denied. The audited screens had zero axe violations.

Lint exited 0 with 91 existing warnings. TypeScript, 241 unit tests, 199
integration tests and 22 SQL checks passed. Local reply and scheduled follow-up
regressions passed 23 and 20 checks. Design, platform, E2E and staging passed
25, 19, 41 and 31 checks. Each command exited 0. See the
[attachment workflow handoff](COMPOSE_ATTACHMENTS_LOCAL_HANDOFF.md) for the
commands, local artifacts and validation limits.

## Scheduled reply follow-up

On 2026-11-12, 20 browser and Auth checks passed with two loopback Gmail
accounts and three conversations. A simulated Vietnam midnight surfaced
only the due conversation. A moved appointment kept its new date across
restart. A reply delivered during preview was picked up at confirmation and
prevented dispatch. One approved reminder lost both provider and browser
acknowledgements. A restart and three replays preserved one dispatch, one
receipt and one Sent row. Local lint, TypeScript, 241 unit tests, 197
integration tests, 21 SQL checks, 23 reply workflow checks, 25 design checks,
19 platform checks and 31 staging checks passed. See the
[scheduled follow-up handoff](REPLY_FOLLOWUP_LOCAL_HANDOFF.md).

## Reply workflow and follow-up

On 2026-11-12, 23 browser and Auth checks passed with two loopback Gmail
accounts and a production-mode Next build. A server-saved draft reopened in
a new mobile viewport session. After Gmail accepted one reply and both the
provider and browser acknowledgement paths were interrupted, a Next restart
and three replays preserved one dispatch, one receipt and one Sent row.
Inbox ignored three decoys and surfaced the linked reply. The commitment
changed only after a separate approval. Local lint, TypeScript, 241 unit tests,
197 integration tests, 20 SQL groups, 25 design, 19 platform, 41 E2E, 22 daily
and 24 catch-up checks passed. See the [reply workflow handoff](REPLY_WORKFLOW_LOCAL_HANDOFF.md).

## Inbox catch-up after absence

On 2026-11-12, the local catch-up workflow passed 24 checks in a production-mode
Next build. Two loopback Gmail accounts received 126 synthetic messages during
three simulated days. After browser disconnection, one provider socket drop and
a Next process restart, the Inbox showed 132 unique messages and all six
outstanding replies. There were 125 later messages than the critical reply.
Source opening, duplicate approval, acknowledgement, tenant isolation and
zero outbound attempts were verified. Lint, TypeScript, 241 unit tests, 197
integration tests, 19 SQL groups, 22 daily, 25 design, 19 platform and 41 E2E
checks completed locally. See the [catch-up handoff](INBOX_CATCHUP_LOCAL_HANDOFF.md).

Latest: [Action Inbox daily commitments local acceptance](ACTION_INBOX_DAILY_LOCAL_HANDOFF.md).
Previous: [Commitment lifecycle local acceptance](COMMITMENT_LIFECYCLE_LOCAL_HANDOFF.md),
[M6 local acceptance report](M6_LOCAL_HANDOFF.md) and
[M6-G Commitment Intelligence evaluation](M6G_LOCAL_HANDOFF.md).

On 2026-11-12, the daily commitment workflow passed 22 local Chrome and Auth
checks. Concurrent approval, lost acknowledgement, reload and late replay
produced one SMTP TLS delivery to Mailpit. UTC+7 and send-claim authorization
were checked in the 18-group SQL suite. Production-mode build, 41 E2E, 25 design,
19 platform, 241 unit, 197 integration, TypeScript and lint (91 existing warnings)
completed locally. The handoff records the shared fixture and the direct-model,
tool-enabled and scripted Inbox comparisons.

The commitment lifecycle milestone on 2026-11-12 verified production-mode
local builds, 41 end-to-end checks, 30 commitment browser checks, 17 SQL
groups, 240 unit and 197 integration tests, TypeScript, 4 scorer tests, and
lint with 91 existing warnings. Shared Auth cases appear in multiple runs.
The new synthetic corpus used the same 22 emails for the previous detector,
the updated detector and both local model baselines. See the milestone
handoff for quality, provenance and remaining coverage.

The M6 closeout reran `npm run test:e2e` on 2026-11-12 at 10:34 ICT, on macOS
arm64 with Node 24.14.1. The command exited 0 with 41 checks and a production-mode
build using only synthetic data. The isolated containers and `.next-build` were
removed. Docker image prune reclaimed 0 B. The earlier local preview returned HTTP
200. [JSON](../../test-results/m6g/closeout-e2e.json) · [Log](../../test-results/m6g/closeout-e2e.log)

On 2026-11-12, Codex completed the three-case retake in local Chrome on macOS
arm64 with Node 24.14.1. The exported JSON matched 5/5 expected events and
preserved explicit confirmation for the empty case. The run used scripted
UI actions with known synthetic cases. `npm run lint`, `npm run typecheck`,
`npm run test:unit` (238), `npm run test:integration` (197),
`node --test tests/eval/commitments/benchmark.test.mjs` (4), and
`npm run test:e2e` (41, including a production-mode build) exited 0. Lint
reported 91 existing warnings. The isolated build directory was removed and
Docker image prune reclaimed 0 B. [UI acceptance](../../test-results/m6g/assistant-acceptance.json) ·
[E2E report](../../test-results/m6g/acceptance-e2e.json)

M6-G manual retake verification on 2026-11-12 ran locally on macOS arm64 with
Node 24.14.1. Chrome verified that an empty case requires confirmation, adding a
row clears the confirmation, removing the last row requires a fresh confirmation,
and the three-case retake exports the case IDs and confirmation flags. The four
benchmark scorer tests passed, including inconsistent confirmation rejection.
`npm run lint`, `npm run typecheck`, `npm run test:unit` (238 tests),
`npm run test:integration` (197 tests) and `npm run build` all exited 0. Lint
reported 91 existing warnings. The build used synthetic configuration and the
separate `.next-build` directory. [M6-G retake](M6G_LOCAL_HANDOFF.md#đối-chiếu-trên-ba-hồ-sơ-đọc-thủ-công)

Previous: [M6-F adversarial security rehearsal](#m6-f-adversarial-security-rehearsal),
[M6-E Gmail consent](#m6-e-gmail-consent),
[M6-D Codex preview and purchasing journey](M6D_LOCAL_HANDOFF.md),
[M6-B local staging, recovery and alert evidence](M6B_LOCAL_HANDOFF.md),
[M6-A local performance and platform evidence](M6A_LOCAL_HANDOFF.md),
[M5-B local AI Operator verification and undo evidence](M5B_LOCAL_HANDOFF.md),
[M5-A local AI Operator evidence](M5A_LOCAL_HANDOFF.md),
[M4-B local Ask Inbox answer evidence](M4B_LOCAL_HANDOFF.md),
[M4-A local Ask Inbox evidence](M4A_LOCAL_HANDOFF.md),
[M3-C local commitment detection evidence](M3C_LOCAL_HANDOFF.md),
[M3-B local commitment workflow evidence](M3B_LOCAL_HANDOFF.md) and
[M3-A local Commitment Ledger evidence](M3A_LOCAL_HANDOFF.md).
Previous: [M2-B local Action Inbox evidence](M2B_LOCAL_HANDOFF.md).
Previous: [M2-A local design system evidence](M2A_LOCAL_HANDOFF.md).
Previous: [M1-C local send evidence](M1C_LOCAL_HANDOFF.md).
Previous: [M1-B local sync evidence](M1B_LOCAL_HANDOFF.md).
Previous: [M1-A local credential vault evidence](M1A_LOCAL_HANDOFF.md). The M0 record
below is historical; M1-A removes the public secret columns described as pending there.

# M0 verification and handoff

This is the original M0 baseline record. The subsequent local-only M0-E work,
updated test counts and real local Auth evidence are in [M0E_LOCAL_HANDOFF.md](M0E_LOCAL_HANDOFF.md).

Date: 2026-11-11 (Asia/Ho_Chi_Minh). Source baseline: `240d9e1`.
Branch: `phase2/m0-security-baseline-20261111`.
Verified implementation commit: `2230c63` (preceded by audit `0a05e64` and
dependency/React baseline `b423a0a`). The final evidence commit changes documentation only.

**Outcome: local security baseline implemented and verified within the scope below.
Production and real-mail readiness: NOT READY.** Remote CI, deployed configuration
and production data have not been inspected or certified. M1-M6 are not implemented.

## Actual checks

Local environment: macOS arm64, Node 24.14.1, npm 11.11.0, PostgreSQL 16.14.
Disk free before installs/builds: 48-50 GiB, above the required 10 GB floor.

| Command / evidence | Baseline | Final observed result |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Original lock installed successfully | Exit 0, 752 installed packages; lockfile reproduced |
| `npm run lint` | Exit 1: 27 errors, 109 warnings | Exit 0: 0 errors, 106 warnings; no rules disabled |
| `npm run typecheck` | Exit 0 | Exit 0 |
| `npm test` | Exit 1: no script | Vitest added; final split suites below cover 126 distinct test cases |
| `npm run test:unit` | No configured runner | Exit 0: 45/45, 6 files |
| `npm run test:integration` | No configured runner | Exit 0: 81/81, 4 files; mocked DB/providers at route boundaries |
| `npm run test:db` | No harness | Exit 0: all 8 legacy migrations + new forward migration applied on disposable local PostgreSQL; anonymous/two-tenant SQL scenarios passed |
| `npm run build` | Exit 1 without configuration: eager clients require credentials | Exit 0 with explicit synthetic build-only environment; Next 16.4.6 compilation, typechecking and prerender completed |
| `npm audit --json` | 77 findings: 6 critical, 27 high, 40 moderate, 4 low | 11 moderate, 0 high/critical; JSON audit itself remains nonzero for moderate findings |
| `npm audit --audit-level=high` | High/critical baseline | Exit 0, with the 11 moderate findings still reported |
| `git diff --check` | Clean initial tree | Exit 0 |

Final logs: [installation](evidence/m0-install.log), [lint](evidence/m0-lint.log),
[TypeScript](evidence/m0-typecheck.log), [unit](evidence/m0-unit.log),
[route integration](evidence/m0-integration.log), [PostgreSQL](evidence/m0-db-tests.log),
[build](evidence/m0-build.log), [audit](evidence/m0-npm-audit.json),
[audit severity gate](evidence/m0-audit-gate.log).
Baseline logs are retained separately. Counts are not added across overlapping runs.

## Implemented behavior and evidence boundaries

- Both Google authorization entry points issue random state, signed HTTP-only
  browser transactions and PKCE S256. Both callbacks require matching authenticated
  user/browser/flow, reject forged/missing/expired/future state before exchange,
  clear transaction cookies on completion and avoid false success on persistence failure.
  Token exchange is mocked; Google consent, provider enforcement and native browser
  cookie behavior have not been tested live. Clearing browser cookies is not a
  durable server nonce ledger; authorization-code single use also relies on Google.
- All five cron endpoints, including method aliases, reject missing configuration
  with 503 and bad/missing credentials with 401 before privileged work. The cost
  aggregator now uses an authorized service client rather than scheduler cookies.
  The worker rejects missing URL/secret and no longer defaults to an old live host.
- Foreign reply and sending-account IDs cannot reach SMTP. Settings bodies cannot
  override user_id/id or submit arbitrary fields. Tests exercise the actual route
  handlers with synthetic records and mocked SMTP/DB, not real mail delivery.
- Admin authorization uses server-managed `app_metadata.role`, not fixed emails
  or email suffixes. Whitelist route tests verify denied and allowed roles. **Rollout
  requires provisioning the legitimate administrator's role through a trusted
  administrative channel; do not reintroduce an email fallback.**
- Real local PostgreSQL tests exercise RLS reads, foreign insert/update/delete,
  cross-tenant source/evidence references, profile self-promotion and primary-account
  RPC checks, while confirming own operations still work. Auth functions/roles are
  a minimal Supabase contract stub. This is not a full Supabase/GoTrue deployment,
  PostgREST test or proof of safety for every SQL table/RPC.
- Resend verification uses the actual SDK and raw-body Svix signatures; valid,
  malformed, tampered, stale and future synthetic signatures are tested locally.
  Event-ID deduplication and actual inbound payload retrieval remain M1 work.
- Production Gmail debug access is disabled and token prefixes removed. Legacy
  credential columns remain readable to their owning authenticated tenant until
  M1 replaces this boundary. **The database tests do not prove a credential vault.**
- Frontend baseline repairs cover conditional hook order, media subscriptions,
  hydration/effect cascades, inline component identity, toast callback ordering and
  timer cleanup. jsdom tests cover key affected behaviors. No visual redesign,
  browser/device certification or full accessibility audit is claimed.

Runtime coverage gaps: compact-list selection/remount behavior and toast auto-dismiss
timing have static lint/type/build coverage but no dedicated browser regression test
in this change. Their end-to-end UI fixtures remain M2/M6 work. Sentry/performance
type-only edits are verified by TypeScript and lint rather than artificial unit tests.
The historical classifier/allocation custom runners were not counted or executed:
some require provider/DB context and others mirror local constants. No classifier
accuracy or AI product advantage is inferred from the new security suite.

## Reproduce build without secrets

Use the synthetic values in `.github/workflows/ci.yml`, especially
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9` and explicit dummy keys, then run
`npm run build`. No `.env.local` or production credentials were created or loaded
for this verification. Building does not prove runtime provider or database health.
The existing eager client initialization still requires valid configuration shape;
removing every eager client belongs to the staged boundary refactor.

`npm run test:db` creates a disposable Unix-socket-only PostgreSQL instance under
the repository and removes it in an EXIT trap. CI instead uses the dedicated
local `inboxai_security_test` database. The script rejects remote database URLs.

## Remaining work and gate

M0 remote handoff is still pending: the workflow is authored, but no push, PR,
GitHub Actions run or branch-protection verification happened. PR scopes and
dependencies are recorded in IMPLEMENTATION_PLAN; they are not remote PR claims.
The workflow does not deploy, consumes no repository secrets and keeps checks blocking.
Render auto-deploy is disabled in the proposed blueprint only; actual hosted
settings remain unknown. The 106 lint warnings and 11 moderate audit findings are
tracked debt, not ignored or relabeled as zero issues.

Before real mail, resolve credential vault/AEAD rotation, token/schema conventions,
paginated/history/IMAP cursor durability, send idempotency, signup email verification,
rate/admission policy, OAuth scope/verification obligations, deployed-schema upgrade
rehearsal and isolated staging. Preserve the four pillars and design standard.
The original Library concept images were not supplied, and pixel matching has not
been attempted. Market/AI quality/latency/cost and direct LLM/agent comparisons
remain unmeasured, appropriate to later product validation rather than M0 mocks.

Do not undo hardening to recover from rollout problems. Keep cron/webhook failing
closed; repair missing configuration. Rehearse admin metadata provisioning and
database upgrade on staging before rollout. No data-dropping rollback is provided.

## Disk and safety record

No project copy, venv or dependency directory was created outside the repository.
Disposable `.codex-db-test-*` PostgreSQL directories were stopped and deleted after
each test run, including the initial failed run. Only the existing standard `.next`
build output was used. No Docker build/prune, real email, production deployment,
production database migration or modification of main occurred.

Technical references checked during implementation:
[OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Resend verification](https://resend.com/docs/webhooks/verify-webhooks-requests),
[Nodemailer 10 requirements](https://nodemailer.com/),
[Sharp changelog](https://sharp.pixelplumbing.com/changelog/).

## M6-C SMTP and IMAP destination controls

The server checks SMTP and IMAP destinations during account setup and on every
connection from stored settings, including sync, lazy bodies, attachments and
SMTP send. SMTP allows implicit TLS on 465 and requires STARTTLS on 587 and
2525. IMAP allows implicit TLS on 993 and requires STARTTLS on 143. TLS 1.2 or
later and a valid certificate for the configured DNS name or IP are required.

Both DNS address families are checked before the application opens a socket. A
disallowed address in either answer blocks the connection. The application
passes one vetted numeric address to the mail driver, preferring IPv4 when
present, and preserves the configured DNS name for SNI and certificate checks.
Attachment downloads query the source account by ID and authenticated owner
because the existing email schema has no PostgREST relationship to that table.

Local runs on macOS, Node 24.14.1, npm 11.11.0 and Next.js 16.4.6 used synthetic
credentials, DNS answers and mail. Wire tests made actual TCP and TLS
connections to loopback fixtures. They tested mixed DNS answers, zero socket
attempts on denied targets, a simulated rebinding answer on re-resolution,
mandatory STARTTLS, wrong certificate names, untrusted certificates and
credential use only after TLS. Local Auth checked that a denied SMTP send
keeps a replayable terminal receipt and a denied IMAP sync preserves its
cursor and message rows. It also covered source-account setup and stored-account
body and attachment reads, including an attachment linked to a foreign account.

| Command | Observed result |
| --- | --- |
| `npm run lint` | Exit 0, zero errors and 91 existing warnings |
| `npm run typecheck` | Exit 0 |
| `npm run test:unit` | Exit 0, 236/236 |
| `npm run test:integration` | Exit 0, 190/190, including 15 mail wire cases |
| `npm run test:db` | Exit 0, 16 groups |
| `npm run test:local-auth -- --m6c` | Exit 0, [88 checks](evidence/m6c-auth-run.json) |
| `npm run test:staging -- --m6c` | Exit 0, [31 checks](evidence/m6c-staging-run.json), including the production-mode Next build and local recovery |
| `npm run build` | Exit 0 with synthetic configuration and 89/89 static pages generated. Existing Sentry import deprecation remains. |

M6-C required no database migration. If the application change is reverted,
keep outbound mail connections disabled until the destination checks are restored.
The security gate remains closed. Hosted network routing, real-provider
interoperability and large-message or folder support still require separate evidence.

The harnesses removed their temporary certificates, archives, database files,
containers and networks. The existing `.next` output was reused. `docker image
prune -f` reclaimed 0 B.

## M6-D purchasing journey

Verified locally on macOS 27.2, Node 24.14.1, Next.js 16.4.6 and Chrome
157.0.8103.52. Both modes use the same synthetic seed in separate environments.
The E2E run used `inboxai-m6d-e2e` and `.next-build` while the manual preview
continued on port `55300` with the same build ID and containers before and after the run.

| Command or observation | Observed result |
| --- | --- |
| `npm run test:e2e` | Exit 0, 24 checks including 14 Auth checks and 10 browser scenarios. The harness completed a production-mode Next build. [Run report](../../test-results/m6d/report.json) |
| `npm run preview:e2e` | Logged in with the synthetic buyer in the Codex desktop browser and saw the schedule-change email under **Cần xử lý**. Restart seeded a new unread, unarchived source row. Ctrl+C removed the fixture containers, networks and temporary certificate directory. |
| `npm run test:local-auth -- --m6c` | Exit 0, 88 regression checks |
| `npm run test:unit` and `npm run test:integration` | Exit 0, 236 and 190 tests respectively |
| `npm run lint` and `npm run typecheck` | Exit 0. Lint reported 91 existing warnings and zero errors. |

The browser run used the production routes, real local GoTrue and PostgreSQL,
and a TLS SMTP fixture that handed mail to Mailpit. The app received synthetic
inbound rows through the fixture seed. The automatic journey used a desktop
viewport and the second tenant check used a mobile viewport. The real-mailbox
and production security gate remains closed.

## M6-E Gmail consent

Both connection entry points request `gmail.readonly` and `userinfo.email`.
Settings requests `gmail.send` separately with Google's incremental authorization
option. The signed PKCE transaction binds the logged-in user, account and
credential revision. Updating the encrypted credential requires a verified
matching Google identity and explicit read and send scopes. If Google omits a
new refresh token, the existing refresh token must return both scopes before
the app saves the grant. An explicit read reconnect returns the app to read-only.
Existing credentials with recorded legacy scopes remain readable.

When a Gmail response explicitly denies sending scope, the app records the
rejected send and disables sending on the matching credential. A complete
provider revocation also interrupts reading. Gmail `gmail.readonly` remains a
restricted scope. The applicability of Google verification and security
assessment stays open. [Google incremental authorization and revocation](https://developers.google.com/identity/protocols/oauth2/web-server#incrementalAuth),
[Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)

`npm run test:e2e` runs the purchasing journey and the Gmail consent scenarios
on production-mode Next.js, local GoTrue, PostgREST and PostgreSQL, Mailpit and
Chrome. The Gmail provider fixture checks PKCE, treats authorization codes as
single-use and returns synthetic scopes and mail. Its HTTP requests stay on
loopback. The test exercises the production application routes and the real local
encrypted vault. There is no database migration in M6-E.

Run on 2026-11-12 with macOS 27.2, Node 24.14.1, Next.js 16.4.6 and Chrome
157.0.8103.52. The dedicated E2E run used port `57300`. The earlier purchasing
preview on `55300` retained the same `.next` build ID and returned HTTP 200.

| Command | Observed result |
| --- | --- |
| `npm run test:e2e` | Exit 0. 35 checks: 14 Auth/database, 10 purchasing journey and 11 Gmail consent. The same command completed the optimized Next.js build. [Local report](../../test-results/m6d/report.json) |
| `npm run lint` | Exit 0, 0 errors and 91 existing warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0, 236 tests across 19 files. |
| `npm run test:integration` | Exit 0, 191 tests across 15 files. |
| `npm run test:design -- --isolated` | Exit 0, 25 checks including desktop, tablet, mobile, dark mode and axe on sampled Inbox states. [Local report](../../test-results/m6d/design-run.json) |

An early test followed Google's authorization redirect with the synthetic OAuth
client ID and Google rejected it as `invalid_client`. The final run intercepts
the first navigation before redirecting, blocks browser egress with an explicit
loopback-only proxy bypass and routes server requests to the local fixture.
The full revocation test waits through the existing sync retry backoff before
checking reconnect and deduplication. Real Google interoperability and hosted
verification remain open.

Both harness runs removed their isolated containers and networks. The generated
`.next-build` output was removed after the last check. `docker image prune -f`
reclaimed 0 B.

## M6-F adversarial security rehearsal

Reproduced three findings against synthetic data before repairing them.

| Finding | Repair and regression evidence |
| --- | --- |
| Mail HTML retained remote and app-relative image sources, CSS and application class names. The sanitizer also appended an inline error handler after sanitizing. | Sanitize the DOM, remove email-supplied styles and active markup, retain embedded raster images and safe links. Chrome observes no request to local or remote tracking probes. Two sanitizer unit tests cover the markup and image policy. |
| The attachment endpoint returned arbitrary MIME bytes inline under the app origin. | Download with `application/octet-stream`, sandbox, `nosniff` and `private, no-store`. Explicit inline previews require a supported raster MIME type and matching bytes. HTML, SVG and PDF remain available as downloads. Integration runs the actual handler with synthetic MIME and a stubbed IMAP transport. |
| The behavior tracker used a service-role email lookup by ID alone. The second tenant received HTTP 200 for a foreign email ID. | Bind the lookup to the authenticated owner before writing behavior or reputation. Reuse the owned sender result for domain tracking. The browser run tests foreign and anonymous denial and the owner's domain log in PostgreSQL. |

The browser fixture uses local GoTrue, PostgREST, PostgreSQL, Chrome and Mailpit.
It checks private email detail, attachment list and download access, copied
citation URLs and Operator plan access with two synthetic tenants and an anonymous
session. The owner sees the invoice amount recorded in the fixture, while Ask Inbox ignores an
instruction to invent a different amount. The fixture attempts an unapproved
execution, foreign target selection and an expanded execution request. It checks
the final database flags and journal and compares send requests, send receipts
and SMTP captures before and after the scenario. The tests cover the current
deterministic Ask Inbox and Operator paths. No model provider call is exercised.

OSV-Scanner 2.7.1 matched `package-lock.json` offline against the public npm
snapshot dated `2026-11-11 21:48:35 UTC` (generation `1794433714913331`, SHA-256
`d94f621c3ef2c1a786197a0a157c61520c926f3277f103910f10f8e21764e11b`). The
scan extracted 908 packages and exited 1 with two Moderate advisories and zero
High or Critical findings in that snapshot. The lockfile remained unchanged.
`glob@13.0.7` is pulled by Sentry's bundler plugins. `minimatch@10.2.6` is
pulled by that `glob` version and TypeScript ESLint. The listed fixes require
major upgrades. Both findings remain open for compatible parent upgrades.
[Offline scanner mode](https://google.github.io/osv-scanner/usage/offline-mode/),
[glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4),
[minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249),
[Local scan](../../test-results/m6f/osv.json)

Native dependencies, container images, hosted configuration and real-provider
behavior are outside this run. This evidence leaves the real-mailbox and
production gate closed.

Local run on 2026-11-12 with macOS 27.2, Node 24.14.1, Next.js 16.4.6 and Chrome
157.0.8103.52. The existing preview on `55300` was served by the earlier build.

| Command | Observed result |
| --- | --- |
| `npm run lint` | Exit 0. Zero errors and 91 existing warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0. 238 tests across 20 files. |
| `npm run test:integration` | Exit 0. 197 tests across 16 files. |
| `npm run test:e2e` | Exit 0. 41 checks, including six adversarial security checks. The harness completed a production-mode Next build. [Local report](../../test-results/m6f/e2e-report.json) |
| `npm run test:design -- --isolated` | Exit 0. 25 checks across desktop, tablet, mobile and dark mode. [Local report](../../test-results/m6f/design-report.json) |
| OSV-Scanner `scan source --offline --lockfile package-lock.json` | Exit 1. Two Moderate npm advisories. [Local report](../../test-results/m6f/osv.json) |

The isolated containers and networks, `.next-build`, OSV snapshot and scanner
binary were removed. Local logs and JSON evidence were retained. Docker image
prune reclaimed 0 B. The M6-D preview returned HTTP 200 with its original build ID.
