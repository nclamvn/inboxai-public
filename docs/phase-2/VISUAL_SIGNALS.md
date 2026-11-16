# Nhận diện nhanh bằng màu và icon

Ngày 16/11/2026, theo yêu cầu nâng cấp UI đang nhợt và khó phân biệt
thoáng qua. Áp dụng trong giao diện hiện có, chỉ local và dữ liệu giả lập.

## Quy ước thị giác

Navy #174A72, canvas #F7F9FA, surface trắng, Inter và Lucide tiếp tục
làm nền nhận diện. Màu nằm ở ô icon 32 px, nhãn, số lượng và vạch thẳng
2 px của dòng. Không tô toàn bộ mỗi thư thành một mảng màu khác nhau.
Navigation và selection giữ vạch navy; vạch thông tin dùng màu ngữ nghĩa.

| Ý nghĩa | Màu chữ/tín hiệu sáng | Icon |
| --- | --- | --- |
| Khẩn, quá hạn | #AC303D | CircleAlert |
| Cần quyết định, cần bổ sung, nguồn cần kiểm tra | #82500C | Flag, FileUp, FileSearch |
| Công việc | #174A72 | BriefcaseBusiness |
| Cá nhân / đang chờ | #285F9E | UserRound / Clock3 |
| Giao dịch | #126D60 | ReceiptText |
| Quảng cáo | #98431E | Tag |
| Bản tin | #526477 | Newspaper |
| Mạng xã hội | #116A80 | MessagesSquare |
| Hoàn tất / đã gửi | #166A4A | CircleCheck / MailCheck |

Dark mode dùng bộ màu sáng riêng trên nền tối. Icon, chữ và trạng thái
cùng truyền đạt ý nghĩa; không bắt người dùng chỉ dựa vào màu. Thư
khẩn thuộc nhóm giao dịch vẫn có icon cảnh báo đỏ và nhãn Giao dịch teal.
Ngữ nghĩa của ưu tiên do ranking hiện có quyết định, không lấy mức
priority cũ hay màu danh mục để tự tạo cảnh báo mới.

Cam kết quá hạn ưu tiên tín hiệu đỏ; cam kết còn mở có nguồn mâu thuẫn
hoặc cần xem xét dùng tín hiệu hổ phách. Cam kết đã hủy dùng màu trung
tính và CircleSlash, không dùng dấu hoàn tất xanh. Hồ sơ chờ Kế toán
có Clock3 xanh, cần bổ sung FileUp hổ phách, bản bàn giao cũ CircleAlert đỏ.

## Nơi áp dụng

- Danh sách Inbox desktop, tablet, mobile và đọc chia đôi: icon đầu dòng,
  vạch màu, nhãn danh mục và ưu tiên; tiêu đề nhóm và số lượng.
- Danh sách thư dùng lại `MailCategoryLabel`, gồm kết quả tìm kiếm và
  nhãn trong màn đọc. Bộ lọc danh mục trên desktop/mobile cùng hệ icon.
- Sổ cam kết, nhóm tôi phải làm/đang chờ/quá hạn/đã khép, thẻ hồ sơ mua
  hàng, cam kết cần chú ý và danh sách hồi đáp/bản nháp.
- Token ở `src/styles/neo-flat.css`; `mail-signal.tsx` chọn icon/tone từ
  danh mục và trạng thái hiển thị. Không thêm thư viện, ảnh raster hoặc
  hiệu ứng chuyển động. Không đổi schema, quyền, xếp hạng hay quy trình gửi.

## Kiểm chứng

`npm run test:design -- --isolated` kiểm thực tế năm màu icon và vạch
khác nhau, ghi nhận icon SVG hiện diện, icon contrast >= 3:1, chữ nhãn
>= 4.5:1, thứ tự ưu tiên cảnh báo trên danh mục giao dịch, focus 2 px,
selection, tìm kiếm, đọc chia đôi, compose và axe qua bốn viewport/theme.
Ảnh nằm ở `test-results/m6d/design/`, số đo trong `browser.json`.

`npm run test:commitment-ui -- --isolated` nay có chế độ dùng Docker và
build riêng, ghi ảnh vào `test-results/commitment-ui/`, không ghi đè ảnh
baseline đã lưu trong docs và không đụng server preview đang chạy.

Kết quả cuối của performance, luồng bổ sung chứng từ và các bộ kiểm tra
nền được ghi trong [VERIFICATION.md](VERIFICATION.md). Đây là kiểm chứng
local với dữ liệu giả lập, chưa phải phép đo tốc độ quét của người thật
hoặc kiểm chứng trên thiết bị native.
