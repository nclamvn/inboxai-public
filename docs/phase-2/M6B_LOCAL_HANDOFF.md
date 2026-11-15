# M6-B staging và diễn tập khôi phục local

Baseline `35bfbab`, nhánh `phase2/m0-security-baseline-20261111`. Bộ diễn tập
chạy Next.js ở production mode, Auth, PostgREST, Mailpit và hai PostgreSQL 16
riêng biệt. Mọi tài khoản, thư, thông tin xác thực và khóa trong lần chạy là dữ
liệu giả lập. Commit `116b8bf` giới hạn chi tiết lỗi cron. Commit `c1f0c3c`
thêm bộ diễn tập staging.

## Chạy lại

Chạy `npm run test:staging` trong checkout này. Lệnh cần Node ≥ 22.12, Docker
Compose hỗ trợ `!override`, Docker context dùng Unix socket local và các image
fixture có sẵn. Trình chạy kiểm tra dung lượng đĩa và từ chối dùng checkout có
tệp môi trường Next có thể nạp khi chạy production mode.

Compose dùng project `inboxai-m6b-local`. Next lắng nghe ở
`127.0.0.1:56300`, API gateway fixture ở `127.0.0.1:56321`. Gateway
chỉ công bố cổng loopback. PostgreSQL, Auth, REST và Mailpit giao tiếp trong
mạng Docker internal. JWT dùng khóa giả lập riêng của staging. SMTP chỉ tới
Mailpit, tài khoản nguồn được vô hiệu hóa trước khi chạy cron và các lệnh gọi
`fetch` từ Next được giới hạn vào API gateway loopback. Các cơ chế này được
dùng cho bộ diễn tập này, không thay thế chính sách egress của môi trường hosted.

Sau mỗi lần chạy, bộ kiểm thử tự đóng Next, proxy, sink cảnh báo và tài nguyên
Compose của staging. Các archive tạm có quyền `0600` và được xóa kể cả khi có
lỗi kiểm thử. Nếu tiến trình bị buộc dừng trước khi chạy cleanup, kiểm tra tài
nguyên mang project `inboxai-m6b-local` trước khi dọn đúng project bằng
`docker compose -p inboxai-m6b-local -f tests/local-auth/compose.yml -f tests/local-auth/staging.compose.yml --profile recovery down`.

## Nâng cấp, sao lưu và khôi phục

1. Dựng schema đến migration `20261111000000_security_baseline.sql`, tạo user
   bằng GoTrue, rồi thêm dữ liệu tài khoản và email ở dạng legacy. Tạo archive
   PostgreSQL bằng `pg_dump --format=custom`, kiểm tra SHA-256 trước khi đưa vào
   cơ sở dữ liệu trống ở máy chủ recovery bằng `pg_restore --exit-on-error --single-transaction`.
2. Trên bản đã khôi phục trước nâng cấp, chạy migration vault có lỗi chia cho 0
   ngay trước `COMMIT`. Kiểm tra DDL và dữ liệu đã rollback, gồm cả cột legacy
   và hash các dòng Auth, hồ sơ, tài khoản, thư. Trên staging nguồn, chạy các
   migration thật theo thứ tự. Email giữ định danh legacy, cột thông tin xác thực
   rời schema public và dữ liệu chờ chuyển được đưa vào vùng cách ly.
3. Chuyển một thông tin xác thực OAuth giả lập sang vault AEAD, tạo một cam kết có
   email làm bằng chứng và thực thi một kế hoạch Operator có biên nhận xác minh.
   Tạo archive thứ hai. Thử sửa một byte và xác nhận checksum chặn trước khi tạo
   database đích. Khôi phục archive đúng và so sánh số dòng cùng hash nội dung
   trên 14 bảng đại diện. Thư ghi vào nguồn sau mốc backup không có trong bản
   khôi phục.
4. Chuyển proxy của Next sang GoTrue và PostgREST dùng database đã khôi phục.
   Kiểm tra đăng nhập mới, vào Inbox, phân quyền giữa hai tenant và anonymous,
   nguồn bằng chứng cam kết, biên nhận Operator và thao tác undo. Giải mã
   thông tin xác thực được khi còn khóa gốc. Bộ khóa thiếu khóa gốc và JWT người
   dùng đều bị từ chối. Việc undo trên recovery không sửa dữ liệu nguồn.

Archive bao gồm dữ liệu và đối tượng trong database. Các role cấp cluster của
Supabase fixture được tạo trước bằng `tests/local-auth/bootstrap.sql`, gồm owner
của các đối tượng Auth và các grant cần thiết. Khóa JWT và khóa vault được cấp
qua cấu hình fixture. Khi sao lưu dữ liệu thật, archive trước nâng cấp và các
bảng cách ly có thể chứa thông tin nhạy cảm. M6-B chỉ thao tác với archive giả lập.

## Log, cảnh báo và số đo

Bộ diễn tập dừng PostgREST nguồn. `/api/health` tiếp tục trả `200`, trong khi
cron có xác thực trả `500`. Hai lần lỗi liên tiếp mở cảnh báo ở sink HTTP
loopback. Lần lỗi thứ ba không gửi cảnh báo trùng. Sau cutover, hai lần thành
công liên tiếp đóng cùng mã sự cố. Probe cron này chạy với tất cả tài khoản mail
đã tắt. Log lỗi cron chỉ ghi thành phần và mã lỗi cố định. Phản hồi lỗi không
còn kèm thông báo thô từ upstream. Bộ kiểm thử đối chiếu log app, probe và cảnh
báo đã nhận với các giá trị nhạy cảm giả lập.

| Archive | Kích thước | Tạo | Khôi phục |
| --- | ---: | ---: | ---: |
| Trước nâng cấp | 259.356 B | 247 ms | 485 ms |
| Sau nâng cấp | 442.385 B | 189 ms | 454 ms |

Từ lúc bắt đầu dừng REST nguồn đến khi probe qua cutover khỏe lần thứ hai là
3.999 ms. Đây là một lần đo local trên fixture nhỏ. Mốc này không bao gồm mọi
kiểm tra nghiệp vụ chạy tiếp sau cutover và chưa thiết lập cam kết RTO hoặc RPO
cho dữ liệu thật. [Archive, checksum, 21 migration, probe và cảnh báo](evidence/m6b-run.json)

## Kết quả kiểm thử

macOS arm64, Node 24.14.1, npm 11.11.0, Docker 29.9.2, Compose 5.6.1,
Next.js 16.4.6, PostgreSQL 16, GoTrue 2.197.0 và PostgREST 14.18.

| Lệnh | Kết quả | Bằng chứng |
| --- | --- | --- |
| `npm run test:staging` | Exit 0, 31 ca gồm 14 kiểm tra Auth dùng chung | [Staging](evidence/m6b-staging.log) |
| `npm run test:local-auth` | Exit 0, 82 ca hồi quy Auth, vault, đồng bộ và gửi thư giả lập. Các ca Auth dùng chung với staging | [Hồi quy](evidence/m6b-auth-regression.log) |
| `npm run test:db` | Exit 0, 16 nhóm SQL và cạnh tranh ghi | [SQL](evidence/m6b-db.log) |
| `npm run test:unit` | Exit 0, 188/188 | [Unit](evidence/m6b-unit.log) |
| `npm run test:integration` | Exit 0, 175/175 | [Integration](evidence/m6b-integration.log) |
| `npm run lint` | Exit 0, 0 lỗi và 91 cảnh báo baseline | [Lint](evidence/m6b-lint.log) |
| `npm run typecheck` | Exit 0 | [TypeScript](evidence/m6b-typecheck.log) |
| `npm run build` | Exit 0, cấu hình giả lập. Còn cảnh báo Sentry deprecation | [Build](evidence/m6b-build.log) |

Chưa diễn tập PITR/WAL, kho backup từ xa, quy mô dữ liệu production, cảnh báo
ngoài máy hoặc khôi phục các thành phần hosted. Không push, deploy, gửi thư
thật hay mở gate production.

Đã dọn container, mạng và archive tạm của lượt chạy. Dùng lại `.next` hiện có.
`docker image prune -f` thu hồi 0 B. [Kiểm tra dọn dẹp](evidence/m6b-cleanup.log)
