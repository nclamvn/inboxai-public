# Verification record

## 2026-11-18: purchase-release Chrome refresh race

Owner authorized a CI repair, local verification, commit/push on `codex/living-commitments` and monitoring all CI jobs. No main merge, deployment or real mailbox access.

- Original remote evidence: [run 44057783359](https://github.com/nclamvn/inboxai-public/actions/runs/44057783359), commit `f57ee0c`. Eight jobs passed; `purchase-release-chrome` failed after deferring the evidence-check appointment (`1 !== 0` reminder buttons). Subsequent design/platform steps in that job were skipped.
- Cause: closing the follow-up dialog acknowledges the schedule mutation, while its parent context refresh is asynchronous. The old test immediately counted DOM nodes after independently verifying the database. It could observe the previous due action before React committed the refreshed appointment.
- Reproduction: hold the browser's context-read response after the successful mutation. The original immediate assertion fails locally with the same `1 !== 0`, despite server status `waiting`. This is controlled transport ordering, not a fixed sleep.
- Repair: retain the held-read regression, release the response, wait for the actual new `<time datetime>` to be visible and the prior action to disappear, then retain the strict zero-node assertion. The next simulated day must still expose the reminder and preserve preview/approval/send-once checks. No application logic, API, migrations, dependencies, quality gate or global timeout was changed.
- Local: `npm run test:purchase-release` exit 0, **30 groups**, including its optimized production build and real Chrome with synthetic Gmail, auth and PostgreSQL. `npm run lint`, `npm run typecheck`, `npm run test:unit` (**342 / 33 files**), `npm run test:integration` (**211 / 17 files**) and `npm run test:db` (**51 groups**) exited 0.
- Local logs and preserved before-fix failure are under ignored `test-results/living-review/ci-repair/`. An orphaned prior synthetic preview was backed up there before its own Compose fixture was stopped; no global container/volume pruning was used. Reused `.next-build` and existing pinned images, with about 30 GiB free. No outside-repository scratch copy or install.
- This entry records local results before the repair push. The new commit's GitHub Actions run is authoritative for remote CI; no remote PASS is inferred from local success.


## 2026-11-17: Living Commitments 3, local review memory

Completed locally on `codex/living-commitments`, HEAD `fb229f97972f`. No commit, push, merge, deploy or real mailbox. See [design and limits](LIVING_REVIEW.md) and [hashed evidence](evidence/living-review-20261117.json).

60 new frozen conversations / 83 mails / 52 gold events, two synthetic Gmail accounts. Corpus SHA-256 `4c8029935cfc2013c436cc66706fc3d1037a057696d1dc4a0497953fcebb7243`, frozen before v3 inference changes. Frozen v2 and all prior evidence remain intact (51 protected artifacts verified). Actual local Qwen inference, never a fixture response. Candidate source hashes remain unchanged throughout both quality runs.

| Configuration | Correct / eligible | Precision | Strict recall | Calls | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| v2 | 50/60 | 83.33% | 96.15% | 60 | 304.9 |
| pipeline | 52/52 | 100.00% | 100.00% | 60 | 353.2 |
| direct | 37/59 | 62.71% | 71.15% | 60 | 304.6 |
| agent | 33/51 | 64.71% | 63.46% | 120 | 424.6 |
| product | 52/52 | 100.00% | 100.00% | 60 | 304.8 |

Targets >=98% precision / >=90% strict recall met on this synthetic protocol. Raw v3 candidates 68, including 16 secondary/unsupported; v2 raw 67 including 7 secondary. Wrong eligible proposals 10 → 0; strict misses 2 → 0. Negative attention 6/20 in both, so secondary effort is not hidden in the score. V3 CLI costs +15.8% time and +11.4% tokens. Do not attribute API-repeat timing differences to an optimization or equate eligible correctness with a flawless raw model.

Actual Chrome 157 desktop/mobile: 29 assertion groups, all 60 input digests match CLI facts, 52 oracle-assisted corpus approvals. Source and ledger stale tabs reject; dropped acknowledgement replays one write; Next/Chrome restart retains results; new evidence attaches to the existing ledger. Review story: four append-only decisions, one real source opening, zero field edits; 0 repeat reviews across 3 reopens versus 3 for an equivalent not-dismissed account scope. Undo does not write the ledger; later explicit approvals append versions 1 and 2. No external sends. This is simulated relevance/oracle review, not human timing.

| Check | Observed result |
| --- | --- |
| lint | exit 0, zero warnings |
| TypeScript | exit 0 |
| unit | 342 tests / 33 files, exit 0 |
| integration | 211 tests / 17 files, exit 0 |
| SQL fresh/upgrade contracts | 51 groups, exit 0 |
| production build + living Chrome | 29 groups, exit 0 |
| final design | 33 groups, exit 0 |
| final platform | 19 groups, exit 0 |
| purchase-release Chrome regression | 29 groups, exit 0 |
| local staging backup/recovery | 33 groups, exit 0; review audit preserved, replay and undo work in restored DB |
| final preview Chrome | desktop/mobile, zero axe violations, no nested clipping, aligned icons, focus restored, unsupported approval denied |

Chronology: full Chrome run precedes small rendering corrections and stronger full-subject review identity. Final SQL/recovery tests cover identity changes. The first preview's root-width and axe checks missed nested horizontal header clipping; visual QA caught it. That evidence remains under `first-*`. Header/search flex shrinking and scroll-preserving focus were fixed; shared design/platform suites rerun. Final preview additionally checks header/main/container/heading bounds and scroll widths, exercises actual-model secondary dismissal/undo (still not approvable) and leaves a sourced deadline change ready to review. No second full quality run is claimed for rendering-only changes.

Initial failures were retained: one test-helper server-only import prevented benchmark boot before any held-out call; two guard compatibility tests, a test typing error and an unused authoring variable were repaired without muting checks. No independent annotator, real user-effort study, real provider, physical native or production validation is claimed. Older indirect/unclear-year formulations remain known coverage limits.

Preview: [open local case](http://127.0.0.1:57300/commitments/living?analysis=2b629450-c177-42b4-8844-57bdba61a3b9). Synthetic login: `mai.nguyen@example.test` / `Synthetic-passphrase-123`. Login first, then reopen the case link if redirected. Start with `npm run living:model` and `npm run preview:living-review`; stop preview before rebuilding acceptance suites. Bench resumes completed pairs; preserve its artifacts. Fixture teardown resets synthetic DB; app/Chrome restart preserves it inside the running fixture.


## Cam kết sống 2: giảm bỏ sót có kiểm chứng, 2026-11-17

Đã triển khai local trên `codex/living-commitments`, không commit/push,
merge, deploy, đổi hosted schema hoặc dùng hộp thư thật. Giữ lại bằng
chứng milestone đầu và ba module v1 nguyên byte để đối chứng. Preview
trước được backup database giả lập trước khi thay fixture. Hash các
artifact milestone đầu đã được kiểm lại và còn khớp.

**Đạt mục tiêu thử nghiệm đã đề xuất trên tập giả lập giữ riêng:** precision
95,7%, strict recall 94,4% (67/71 sự kiện). Đây không phải chứng nhận sản
phẩm/production hoặc phép đánh giá độc lập. Tập phát triển 40 hội thoại cũ
được dùng để chỉnh prompt, đạt 51/53 trong lượt phát triển cuối; số đó không
được trộn vào 60 hội thoại mới.

### Dữ liệu và phương pháp

60 hội thoại mới, 91 thư, 71 sự kiện theo nhãn, hai Gmail loopback. Dữ liệu,
nhãn và protocol khóa trước khi thay inference; digest
`146fa9ae63053797bdeae0a50aea5f83de1b3fd1273cf525b591cc6cf9add907`.
Có lời hứa gián tiếp/không hạn, ngày tương đối, nhiều việc trong một thư,
đổi người/hạn, hoàn tất/hủy, thư cũ đến muộn, sai người, quote và injection.
16 hội thoại không có sự kiện gold. Dữ liệu do Codex viết, có các nhóm cùng
mẫu cấu trúc, chưa được người độc lập gán nhãn; ngày năm 2027 là thời gian
trong email giả lập. Đầu vào mới so với vòng trước không đồng nghĩa mẫu
đại diện cho hộp thư thật.

Inference được khóa bằng source hash trước ca held-out đầu tiên. Không
sửa bộ đọc sau khi xem kết quả mới. Qwen3-4B-Instruct-2507 Q4_K_M và
llama.cpp b12242 như milestone trước, macOS arm64/M1 Max 32 GiB, Node
24.14.1, Next 16.4.6, Chrome 157.0.8103.79, context 8.192, một slot,
reasoning off, temperature 0, seed 82, request `cache_prompt:false`.
Không gọi cloud model. Weights SHA-256
`85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9`;
runtime archive
`d58f23da84befb84b7d07590e7fd18ea68a3f1df59f9808b52370255aa60f20b`.
Cache được xác minh lại cuối nhiệm vụ, không tải thêm bản sao.

Model mới tìm câu và quan hệ bằng schema sáu trường. Code giữ quote,
chuẩn hóa item theo vị trí câu, lấy sender/new owner rõ ràng, xử lý các
dạng ngày được hỗ trợ theo thời điểm gửi ở Việt Nam, kiểm nguồn/quyền/thứ
tự và tạo reference. Vẫn một lời gọi/thread, tối đa 60 giây, không thêm
agent/reviewer/repair loop mặc định. Metadata UUID không còn làm đổi input
model: hash payload của 60 ca Chrome khớp cả 60 ca pipeline CLI.

### Kết quả trước khi reviewer sửa hoặc duyệt

| Nhánh, cùng 60 hội thoại | Đúng / đề xuất đủ điều kiện | Precision | Strict recall | Tổng thời gian | Lượt model |
| --- | --- | --- | --- | --- | --- |
| V1 giữ nguyên | 52/55 | 94,5% | 73,2% | 268,7 giây | 60 |
| V2 pipeline CLI | 67/70 | 95,7% | 94,4% | 324,3 giây | 60 |
| LLM trực tiếp local | 44/70 | 62,9% | 62,0% | 314,8 giây | 60 |
| Agent công cụ chỉ đọc local | 45/70 | 64,3% | 63,4% | 433,8 giây | 120 |
| V2 qua API trong Chrome, lượt đầy đủ đạt | 67/70 | 95,7% | 94,4% | 207,3 giây | 60 |

Strict match gồm source/origin/item/kind, owner/due khi áp dụng, quote có
trong nguồn và chứa task anchor đã định trước. Detection recall bỏ qua
owner/due: V1 54/71 (76,1%), V2 68/71 (95,8%). Tức là bỏ sót hoàn toàn
17 xuống 3; thiếu/sai trường theo strict metric 19 xuống 4. V2 vẫn có ba
đề xuất sai, không được bỏ khỏi bảng. Chưa chấm ngữ nghĩa tiêu đề hoặc
entailment bằng người độc lập.

Bốn nhánh CLI luân phiên thứ tự mỗi ca, không chạy consumer model khác
đồng thời. Direct tự trả owner/due và nhận cả phần trích lại; product có
code xử lý lịch và lọc quoted text. Agent thực sự gọi công cụ đọc, tối đa
hai batch/ba lời gọi, không có quyền ghi. Cùng facts/model/hardware nhưng
prompt/schema/preprocessing là các workflow khác nhau; kết quả không
chứng minh hơn model hoặc agent tổng quát mạnh hơn.

Thời gian CLI là từ gọi pipeline đến đề xuất, không gồm build, model load,
duyệt/sửa và tạo bù. V2 CLI chậm hơn V1 trong lượt này, token input/output
57.487 so với 39.229; direct 34.940, agent 75.260. Mỗi baseline chỉ một lượt.
Lượt Chrome đầu ghi 357,2 giây cho 60 API responses, sau đó fail UI; lượt
chạy lại 207,3 giây với cùng điểm và input hash. Không gọi chênh lệch đó là
hiệu quả tối ưu inference, không suy rằng mọi tầng cache backend đã tắt
chỉ vì request đặt false. Chưa tách tải máy/nhiệt/cache hoặc đo năng lượng,
khấu hao phần cứng. P50/P95 API lượt đạt: 2,49/5,97 giây, chỉ trên tập này.

Reviewer ước tính: V1 duyệt 52/không duyệt 3/tạo hoặc sửa bù 19/đọc 9 ứng
viên còn lại; V2 là 67/3/4/14. Lượt đối chiếu câu nguồn 64 lên 84, không
phải số email duy nhất. Trong 16 hội thoại âm tính, số ca vẫn có thẻ cần
xem tăng 2 lên 6; số ca có đề xuất firm sai đều là 1. Vì vậy chưa chứng
minh tiết kiệm công người thật. Script biết gold chỉ duyệt các đề xuất
khớp nhãn; 67 revision được xác nhận qua mobile UI. 17,1 giây reviewer
script không phải thời gian người đọc. Hành trình cuối khoảng 274,5 giây,
bao gồm UI và các ca gián đoạn, không gồm build/seed.

Tổng phép đo CLI dùng 300 lời gọi. Ngoài bảng còn 96 lời gọi phát triển,
hai lượt Chrome mỗi lượt 60 ca, các ca lỗi/gián đoạn riêng và preview.
Không coi chi phí inference trong bảng là toàn bộ công phát triển hoặc
coi local là không có chi phí.

### Luồng và kiểm thử

Chrome thật qua Auth/PostgREST/PostgreSQL và hai Gmail loopback, không mock
model. Kiểm offline trước phân tích, không biến lỗi thành kết quả rỗng;
response cache đến muộn không đè hội thoại mới; cùng title/thread ID ở
account khác không ghép nguồn. Source đến sau lúc mở dialog chặn snapshot
cũ. Cắt phản hồi sau ghi, ngắt mạng, restart Next, replay cùng key chỉ có
một revision. Đóng/mở lại tiến trình Chrome và phiên mobile mới vẫn đọc
được lịch sử và Ask Inbox. Tab khác đổi sổ chặn version cũ; rà lại áp dụng
hạn mới, giữ title sửa tay, khép cùng cam kết ở version 4.

Một ca riêng tạo sổ từ quote ngắn đã duyệt, model mới chọn cả câu đầy đủ,
nguồn khớp duy nhất nối đúng ledger; đổi hạn append version 2, giữ sửa tay.
SQL còn kiểm tenant/account, nhiều task cùng nguồn phải chặn khi mơ hồ,
và nguồn tạo đã thay đổi không được âm thầm sinh thêm một task mới.
Axe/tràn ngang ở ảnh đã chụp đều qua và có xem lại trực quan. Đây là Chrome
viewport, không phải native device hoặc chứng cứ provider thật. Không có
Gmail send và không mở cổng dùng dữ liệu thật.

| Lệnh | Kết quả thực tế |
| --- | --- |
| `npm run lint` | Exit 0; zero errors/warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0; 319 tests / 31 files. |
| `npm run test:integration` | Exit 0; 210 tests / 17 files. |
| `npm run test:db` | Exit 0; 50 nhóm SQL fresh, gồm nâng cấp và relink evidence. |
| `npm run bench:living-coverage` | Exit 0; bốn nhánh đủ 60 ID, không có protocol error, candidate giữ nguyên. |
| `npm run test:living-coverage` | Lượt đầy đủ sau sửa UI exit 0; 25 nhóm, optimized Next build; 60 live inferences và các ca gián đoạn riêng. |
| `npm run bench:living-coverage -- --compare` | Exit 0; đúng digest/đủ ID; target precision/recall đề xuất đạt trong phạm vi protocol. |
| `npm run test:design -- --isolated` | Exit 0; 33 nhóm. |
| `npm run test:platform -- --isolated` | Exit 0; 19 nhóm browser performance/a11y. |
| `npm run test:purchase-release` | Exit 0; 29 nhóm hồi quy chứng từ. |
| `npm run test:staging -- --isolated` | Exit 0; 31 nhóm nâng cấp/backup/restore/alert. |
| `npm run living:model -- --prepare-only` | Exit 0; checksum cache khớp. |
| `npm run preview:living-coverage` | Đang phục vụ local; smoke Chrome bản cuối exit 0, model thật và một sửa ngày có xác nhận. |

Lượt Chrome đầu đã đọc đủ 60 nhưng fail ở race dialog bị đóng khi URL bắt
kịp analysis mới. Log/report/product đầu được giữ `first-*`. Đã sửa binding
dialog theo analysis ID và chạy lại toàn bộ Chrome đạt. Các guard UI cuối
cho URL nguồn bắt kịp và unmount được kiểm riêng bằng unit và preview;
không đổi inference. Lint warning generator, import bridge của snapshot,
relink nhầm đọc quote trực tiếp từ anchor (anchor chỉ giữ vị trí/hash), và
thiếu dialog API ở jsdom đã được sửa, không tắt check. Các lượt lỗi setup
còn trong artifact. Microcopy date cảnh báo khả năng bộ phân giải, không
đổ lỗi rằng câu nguồn nhất thiết thiếu ngày.

### Mục còn mở

CV-03: chưa đọc được ngày trong dạng “hạn 15 tháng 1 năm 2027”; CV-16,
CV-19, CV-20: bỏ lời hứa có weekday/ngày viết bằng chữ chưa đủ năm/không
hạn. CV-43: nhận nhầm “chưa có cập nhật mới” thành hủy. CV-54: định dạng
`Forwarded message:` chưa được lọc đúng, sinh cam kết từ nội dung cũ. Không
vá các ca này rồi báo lại chúng là held-out đã đạt. Cần dữ liệu mới để
đánh giá các lần sửa tiếp. Calendar parser không bao phủ mọi cấu trúc ngày
mơ hồ; user vẫn cần kiểm tra nguồn. Không có worker LLM quét nền, tìm/đọc
attachment hoặc tự xác minh hoàn tất ngoài email trong milestone này.

Tài liệu phạm vi/rollback: [LIVING_COVERAGE.md](LIVING_COVERAGE.md).
Bằng chứng tổng hợp có hash: [evidence/living-coverage-20261117.json](evidence/living-coverage-20261117.json).
Raw output, log và ảnh ở `test-results/living-coverage/`. Security gate
vẫn đóng; không có kiểm chứng user thật, native device, provider thật,
hosted cutover hoặc production từ các kết quả trên.

Preview bản cuối có 60 hội thoại/91 thư trên hai Gmail giả lập. Smoke trên
Chrome desktop/mobile trì hoãn URL chọn nguồn rồi bấm phân tích ngay,
kiểm kết quả không bị mất. Với CV-03, model thật trả due=null; reviewer
giả lập nhập 2027-01-15 trước khi duyệt. Sổ version 1 và Ask Inbox đọc lại
đúng ngày cùng câu nguồn. Đây là sửa bù theo gold, không cộng vào điểm
model. Đã xem lại ảnh, axe/tràn ngang qua. Link thử:
`http://127.0.0.1:57300/commitments/living?analysis=b1aad916-d076-4674-93f7-fbb11ca6efae`.
Tài khoản `mai.nguyen@example.test`, password giả lập `Synthetic-passphrase-123`.
Model/server preview giữ chạy; `.next-build` là build dùng lại duy nhất,
không có project copy hoặc scratch ngoài repo. Không có push/deploy.


## Cam kết sống, LLM local chạy thật, 2026-11-17

Nhánh local `codex/living-commitments`, base
`fb229f97972f1866b2ee31c70a10dcf99e0617c8`. Không commit/push, merge,
deploy, migration hosted hoặc dùng hộp thư thật trong milestone này.
Đã triển khai đọc hội thoại bằng LLM, xem/sửa đề xuất, xác nhận có nguồn,
lưu revision và hỏi trạng thái đã xác nhận. **Luồng kỹ thuật đã được nghiệm
thu trên giả lập; chất lượng nhận diện chưa đạt mục tiêu recall đề xuất.**

Môi trường: macOS arm64, Apple M1 Max 32 GiB, Node 24.14.1, Next 16.4.6,
Chrome 157.0.8103.79. Suy luận thật bằng Qwen3-4B-Instruct-2507 Q4_K_M,
llama.cpp b12242, Metal, context 8.192, một slot, temperature 0, seed 82,
request `cache_prompt:false`, reasoning off. Model SHA-256
`85e4a5b7b8ef0e48af0e8658f5aaab9c2324c76c1641493f4d1e25fce54b18b9`;
archive runtime
`d58f23da84befb84b7d07590e7fd18ea68a3f1df59f9808b52370255aa60f20b`.
Không gọi API model cloud. Launcher mới dùng thêm `--no-context-shift`;
đã khởi động và kiểm Chrome với launcher đó sau phép đo.

### Hành trình được kiểm chứng

40 hội thoại mới, 61 thư, 53 sự kiện theo nhãn, qua hai Gmail loopback và
sync checkpoint thật của sản phẩm. Corpus/nhãn được khóa trước lượt đo đầu,
digest `101ca72bca96bb29246a01cdb743ef0552e49d7b717e6337dbb1479dcf8e8f1a`.
Codex viết dữ liệu/nhãn; chưa có gán nhãn độc lập. Không sửa prompt sau khi
xem kết quả. Một thư thử riêng trước đo phát hiện model chép nhầm tháng;
code đã đổi ngày số duy nhất từ chính câu nguồn trước cả hai lượt đo.

Mỗi hội thoại được mở và gọi model trên Chrome desktop/mobile luân phiên.
Phân tích đã lưu được đọc lại không cần gọi model. Reviewer **giả lập dùng
nhãn chuẩn** duyệt 40 sự kiện đúng ở lượt lặp, không tự coi đó là đánh giá
người dùng hoặc giấu các đề xuất sai. Mỗi revision giữ email/câu nguyên văn.
Một hội thoại bổ sung có cùng tiêu đề và Gmail thread ID ở tài khoản thứ
hai vẫn tách scope; tenant khác và anonymous không đọc được nguồn/cache.

Hành trình gián đoạn mở dialog rồi nhận thư đổi hạn: RPC từ chối snapshot
cũ và không ghi quyết định. Lượt mới sửa được nội dung trước khi duyệt;
server đã ghi nhưng phản hồi bị cắt, browser mất mạng và Next restart.
Thử lại đúng key chỉ có một quyết định, `replayed:true`. Một phiên mobile
mới đọc lại lịch sử và Ask Inbox với nguồn riêng cho người/hạn/trạng thái.
Tab cũ bị chặn tiếp khi phiên bản sổ thay đổi dù email giữ nguyên. Rà soát
lại cập nhật đúng hạn, giữ nội dung người dùng sửa, rồi thư hoàn tất mới
được model liên kết vào cùng cam kết và khép phiên bản 4. Không gửi email.

Axe và kiểm tràn ngang được chạy ở các màn đã chụp, có xem lại ảnh desktop,
mobile, dialog duyệt và câu trả lời đã xác nhận. Đây là Chrome viewport,
không phải chứng cứ native device. Restart giữ PostgreSQL và khởi động lại
Next, sau đó mở phiên browser mới; không phải mất đĩa hoặc xóa fixture.
Sau lượt Chrome đầy đủ, biên nhận dùng lại giữa các analysis được bổ sung
và kiểm bằng SQL fresh; sửa câu chữ/gộp thông tin kỹ thuật trong UI được
kiểm thêm ở preview hiện tại. Smoke preview gọi model thật từ cache pin,
duyệt trên mobile, đọc Ask Inbox và mở đúng nội dung email nguồn.

| Lệnh | Kết quả thực tế |
| --- | --- |
| `npm run lint` | Exit 0; zero errors/warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0; 287 tests / 28 files. |
| `npm run test:integration` | Exit 0; 209 tests / 17 files. |
| `npm run test:db` | Exit 0; 49 nhóm SQL, gồm quyền private, tenant, scope, biên nhận qua phân tích mới, retry và nguồn đổi. |
| `npm run test:living-commitments` | Exit 0; 22 nhóm (14 nền + 8 hành trình); optimized Next build. Lượt đầu 20 nhóm, sau đó mở rộng ca cùng tiêu đề và khép phiên bản 4. |
| `npm run bench:living-commitments` | Exit 0; rules/direct/agent đủ 40 ca, direct 40 và agent 80 lời gọi model thật; không có lỗi giao thức. |
| `npm run bench:living-commitments -- compare` | Exit 0; đúng digest và đủ 40 ID ở cả bốn nhánh, lỗi/thiếu vẫn được tính. |
| `npm run test:design -- --isolated` | Exit 0; 33 nhóm desktop/tablet/mobile/dark. |
| `npm run test:platform -- --isolated` | Exit 0; 19 nhóm performance/accessibility, 600 thư, không tính native. |
| `npm run test:purchase-release` | Exit 0; 29 nhóm hồi quy luồng chứng từ. |
| `npm run test:staging -- --isolated` | Exit 0; 31 nhóm nâng cấp/backup/restore/alert, gồm lỗi rollback cố ý. |
| `npm run living:model -- --prepare-only` | Exit 0; xác minh checksum cache đã chuyển, không tải thêm bản sao. |
| `npm run preview:living` | Đang phục vụ local 57300; smoke Chrome riêng exit 0 sau model cache launch, không tính thêm vào phép đo. |

### Đối chứng và giới hạn chất lượng

| Nhánh | Đúng / đề xuất | Precision | Recall trên 53 sự kiện | Tổng thời gian trả kết quả | Lượt model |
| --- | --- | --- | --- | --- | --- |
| Rules hiện có + liên kết đơn giản | 17/20 | 85,0% | 32,1% | 0,029 giây | 0 |
| InboxAI lượt lặp guard-v2 | 40/42 | 95,2% | 75,5% | 132,1 giây | 40 |
| LLM trực tiếp | 39/51 | 76,5% | 73,6% | 206,0 giây | 40 |
| Agent công cụ chỉ đọc | 33/42 | 78,6% | 62,3% | 245,1 giây | 80 |

Lượt InboxAI đầu đúng **37/39 (94,9%), recall 37/53 (69,8%)**; không thay
số đó bằng lượt đẹp hơn. Lượt đầu dùng guard-v1; sau đó guard-v2 bỏ phụ thuộc
vào chỉ mục việc khi tạo khóa và chặn đổi người sang null. Prompt không đổi.
LC-17/LC-27 đổi output trong lượt lặp với metadata account UUID mới. Lượt
lặp là hồi quy trên tập đã thấy, không phải phép đo độc lập chưa thấy.

Thời gian bảng là tổng thời gian chờ kết quả cho 40 ca, không gồm khởi
động model/build, duyệt, sửa hoặc tạo bù. InboxAI lượt lặp đo đến API trả
kết quả (128,3 giây là số đo riêng quanh lời gọi model), chưa tính mở màn,
chụp ảnh hoặc xác nhận. Lượt đầu ghi 221,6 giây gồm cả thao tác UI/cache;
197,2 giây quanh model được phục hồi từ cache metrics, không so trực tiếp
221,6 với 132,1 rồi gọi là tối ưu. Direct/agent đo vòng gọi và xử lý công cụ.
Agent dùng JSON protocol đọc email, tối đa hai batch/ba lượt model; không
có quyền ghi. Cùng weights/hardware nhưng input sản phẩm có UUID/metadata
PostgreSQL, baseline dùng tên account; không giống từng byte. Chỉ một lượt
mỗi baseline, phần lớn direct chạy trước agent. Không khẳng định ưu thế
latency ổn định từ các số trên. Tổng token input/output: InboxAI 28.380,
direct 26.830, agent 53.951. Chi phí năng lượng/khấu hao chưa đo.

InboxAI lượt lặp cần duyệt 40, loại 2, tạo bù 13 sự kiện và kiểm 42 nguồn;
direct tương ứng 39/12/14/51, agent 33/9/20/42, rules 17/3/36/20. Đây là
**ước tính công từ nhãn**, chưa phải click/time của người thật. Không coi
một lần tạo bù tốn bằng một lần duyệt để khẳng định tiết kiệm công. Không
đo lại đọc thư thủ công bằng script đóng vai con người. Tính đúng tiêu đề
về ngữ nghĩa và entailment của câu nguồn chưa được chấm độc lập.

Hai lỗi vẫn còn ở cả hai lượt sản phẩm: LC-05 bỏ hạn “ngày mai”, LC-31 nhận
nhầm câu hỏi nhờ gửi thành cam kết. Nhiều lời hứa gián tiếp và biến đổi vẫn
bị bỏ sót. Chưa đạt mục tiêu recall 90% đề xuất lịch sử, và chưa có bằng
chứng thị trường hoặc người thật để tuyên bố hơn LLM/agent. Giá trị được
chứng minh trong phạm vi này là lưu trạng thái có xác nhận, nguồn, chống
lặp và chặn quyết định cũ; không phải model tự hiểu đúng mọi thư.

Bằng chứng nhỏ có hash artifact được lưu tại
[evidence/living-local-20261117.json](evidence/living-local-20261117.json).
Log, raw output và ảnh ở `test-results/living-commitments/`. Một số lỗi
setup ban đầu (trigger cần SECURITY DEFINER, fixture thiếu from_address,
prop Modal, smoke thiếu tsx loader) được giữ trong log; lint warning biến
không dùng đã được sửa, không tắt check. Xem phạm vi/rollback và lệnh tái lập
trong [LIVING_COMMITMENTS.md](LIVING_COMMITMENTS.md).

Preview: `http://127.0.0.1:57300/commitments/living`, account giả lập
`mai.nguyen@example.test`, password `Synthetic-passphrase-123`. Preview
riêng không sửa bản pilot cũ. `.next-build` là output duy nhất đang dùng
cho preview này; `.next` của pilot trước được giữ. Model/runtime được chuyển,
không copy, sang cache repo `node_modules/.cache/inboxai-living-model`
(khoảng 2,4 GiB); thư mục runtime cũ đã bỏ. `docker image prune -f` thu 0B,
không prune volume/container, đĩa còn khoảng 59 GiB. Model server chỉ loopback
nhưng chưa có auth riêng; real-mailbox/security gate vẫn đóng. Phân tích cần
người dùng yêu cầu theo thread, chưa có worker LLM quét nền. Không phát sinh
push/deploy, không có chứng cứ provider/native/production từ milestone này.


## Bản dùng thử local liền mạch desktop/mobile, 2026-11-17

Milestone nối các bề mặt sản phẩm hiện có vào một bản thử tương tác, chạy
qua hai Gmail loopback, các phiên Chrome độc lập và PostgreSQL local.
Không push, deploy, sửa main hay dùng hộp thư thật. Môi trường macOS arm64,
Node 24.14.1, Next 16.4.6 và Chrome 157.0.8103.79.

PO-81724 bắt đầu ở yêu cầu bổ sung hạn thanh toán. Người mua lưu nháp
trên desktop, tiếp tục bằng phiên mobile độc lập, ngắt mạng, khởi động
lại Next và mở lại phiên. Ask Inbox giữ hai hạn mâu thuẫn và đối chiếu
60.000 VND với trích dẫn có phiên bản trên hai tài khoản. Gửi trên mobile
chỉ xảy ra sau xem trước/phê duyệt; mất phản hồi được đối chiếu thành một
lượt gửi. Hồi đáp thiếu hạn giữ hóa đơn gốc. Bản hợp lệ được nạp lặp,
ghi nhận, bàn giao và Kế toán duyệt qua một phiên mobile riêng. Khép ngoại
lệ và quyết định giữ sau restart, không khẳng định toàn bộ PO đã nhận đủ
hàng hoặc tiền đã chuyển. Operator xem trước, duyệt phạm vi, thực thi,
xác minh và hoàn tác lưu trữ các thư quảng cáo trong cùng bộ dữ liệu.

Trang điều khiển được kiểm chặn Origin/token sai, reset chưa xác nhận và
nạp hồi đáp trước lúc gửi. Reset từ nút thật trong Chrome, sau khi nhập
`ĐẶT LẠI`, xác minh snapshot và khôi phục database/provider riêng; một
phiên đăng nhập mới mở lại đúng yêu cầu ban đầu, không còn lượt gửi thử.
Kiểm tra mất mạng/phục hồi ở trang hướng dẫn xác nhận thông báo lỗi cũ
được thay bằng trạng thái đã kết nối lại. Các ảnh được kiểm axe, tràn ngang
và xem lại trực quan. Chúng là Chrome viewport, không phải native device.

| Lệnh | Kết quả thực tế |
| --- | --- |
| `npm run lint` | Exit 0; zero errors/warnings. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0; 267 tests in 25 files, gồm 7 ca cho banner local và chặn metadata/origin không hợp lệ, kể cả JSON null. |
| `npm run test:integration` | Exit 0; 200 tests in 16 files. |
| `npm run test:local-pilot` | Exit 0; 23 nhóm assertion (14 nhóm Auth/RLS nền và 9 nhóm hành trình), có optimized Next build; log `final-pilot.log`. |
| `npm run test:db` | Exit 0; 48 nhóm assertion SQL. |
| `npm run test:design -- --isolated` | Exit 0; 33 nhóm, optimized build và kiểm desktop/tablet/mobile/dark. |
| `npm run test:platform -- --isolated` | Exit 0; 19 nhóm browser performance/accessibility; không tính là kiểm native. |
| `npm run test:purchase-release` | Exit 0; 29 nhóm hồi quy cả luồng yêu cầu chứng từ đến duyệt xong. |
| `npm run test:staging -- --isolated` | Exit 0; 31 nhóm nâng cấp, backup, khôi phục và cảnh báo. |

Các lượt đầu được giữ thành `attempt-*.log`: Docker ban đầu chưa chạy;
fingerprint từ chối bản đang thay đổi source trong lúc dựng; một vai
outsider của fixture thiếu whitelist; và kiểm tra Operator đọc checkbox
trước khi preview tải xong. Đã bổ sung đúng admission fixture và chờ trạng
thái preview, không tắt kiểm tra quyền hoặc bỏ assertion nghiệp vụ. Một
lượt trọn luồng đã qua, sau đó sửa trạng thái thông báo phục hồi kết nối
và chạy lại toàn bộ luồng thành công.

Log/ảnh/JSON: `test-results/local-pilot/`. `workflow.json` ghi commit nền,
fingerprint, Chrome, hóa đơn trước/sau, quyết định được duyệt, số gửi và
thế hệ reset; `checks.json` ghi các lượt hồi quy cuối. Các giá trị do
fixture sinh không phải dữ liệu khách hàng hay benchmark người dùng.
Ask Inbox ở đường nghiệm thu dùng tổng hợp xác định. Không gọi LLM/agent
thật trong milestone này, không thêm phép đo hay tuyên bố lợi thế AI.

Xem [cách chạy, phạm vi reset và giới hạn](LOCAL_PILOT.md). Cold restart
cả supervisor/Docker không nằm trong cam kết lưu tiến độ; chạy mới tạo
phiên giả lập mới. Gate dữ liệu thật tiếp tục đóng.

Kiểm tra trên preview phát hiện bước chuẩn bị ban đầu chỉ gọi một lượt
sync, nên 104 thư nền mới chỉ có 60 thư ghi vào database. Đã thêm vòng
drain có giới hạn qua API checkpoint và đếm thực tế theo tenant/UID,
không insert thư trực tiếp để lách sync. Bộ mới chỉ sẵn sàng khi đủ 104
thư nền; tổng là 110 thư Gmail đã đồng bộ trong hai tài khoản. Một bản
ghi Auth/RLS nền không thuộc Gmail được loại khỏi số hiển thị này.
Browser kiểm số thực tế >100 và dòng số lượng trên trang hướng dẫn.

Sau các kiểm tra bổ sung, lượt `test:local-pilot` cuối chạy lại exit 0,
23 nhóm, fingerprint `03b3c7be23d6` trên commit nền `38c4767`. Các thay đổi
milestone vẫn là working tree local. Đã xóa `.next-build` trước khi dựng
bản tương tác riêng bằng `.next`; không tạo distDir hay bản sao project khác.

Bản tương tác cuối đã khởi động bằng `npm run preview:local`. `/version`
xác nhận fingerprint build và mã nguồn đều là `03b3c7be23d6`; `/config`
và truy vấn PostgreSQL cùng xác nhận 2 Gmail, 110 thư Gmail đã đồng bộ.
`/state` ở `buyer`, INV-41724, chưa có nháp yêu cầu và 0 lượt gửi: người
dùng nhận bộ ban đầu, không phải trạng thái sau bài test. Trang hướng dẫn
`http://127.0.0.1:57343/`, ứng dụng `http://127.0.0.1:55300/inbox`.
Metadata tại `test-results/local-pilot/live-readiness.json`, log server
`preview.log`. Đã mở trang hướng dẫn trong Chrome native và quan sát đúng
phiên bản ở lượt mở đầu; trình duyệt điều khiển trực tiếp qua extension
không khả dụng nên dùng AX native. Nghiệm thu đầy đủ dùng Chrome qua harness.
Giữ server `.next` và fixture chạy để dùng thử, xóa `.next-build`; Docker
image prune cuối thu hồi 0 B. Không tạo scratch/venv ngoài repo, không
prune volume/container hay dừng các project Docker khác.

Ngày 17/11/2026, owner yêu cầu commit/push trước khi làm milestone tiếp theo.
Checkpoint `codex/local-pilot` kế thừa `38c4767` (nhánh technical-debt đã qua
CI), không merge main/deploy. Trước commit, tính lại fingerprint source và
đối chiếu `workflow.json`: cùng `03b3c7be23d6`, không có thay đổi hành vi
sau lượt nghiệm thu cuối. Chỉ cập nhật tài liệu về quyền lưu checkpoint.
Log, snapshot database và cấu hình cá nhân `.codex/` không đưa lên Git.
Remote CI của checkpoint là bằng chứng riêng, không coi các lượt local
trên đây là kết quả CI.

## Technical-debt cleanup and authorized branch checkpoint

2026-11-16, macOS arm64, Node 24.14.1, Next.js 16.4.6, Chrome
157.0.8103.79 and disposable PostgreSQL 16 fixtures. Owner authorized commit
and push on a separate branch; no main merge, deploy or real mail.

| Command | Observed local result |
| --- | --- |
| `npm run lint` | Exit 0; zero errors and warnings, down from 92 warnings; `--max-warnings=0` now enforced. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0; 260 tests in 24 files. |
| `npm run test:integration` | Exit 0; 200 tests in 16 files. |
| `npm run test:db` | Exit 0; 48 SQL assertion groups. |
| `npm audit --audit-level=moderate --json` | Exit 0; zero reported vulnerabilities, down from 11 moderate. This is the observed npm advisory scan, not a security certification. |
| `npm ls @sentry/nextjs glob minimatch eslint-plugin-react-hooks --depth=5` | Exit 0; Sentry 11.12.0, glob 14.0.6, scoped ESTree minimatch 11.0.7, existing Hooks rule baseline 7.0.1. |
| `npm run test:design -- --isolated` | Exit 0; 33 checks across desktop, tablet, mobile and dark mode, including icon and label contrast. |
| `npm run test:platform -- --isolated` | Exit 0; 19 browser performance/accessibility checks. Native devices were not retested. |
| `npm run test:purchase-release` (fresh fixture rerun) | Exit 0; 29 checks, including approval freshness, interrupted review progress and evidence-request follow-through to closure. |
| `npm run test:reply-workflow` | Exit 0; 23 checks including two mailboxes, mobile draft restore, lost acknowledgement and application restart. |
| `npm run test:compose-attachments` | Exit 0; 21 checks including exact duplicate-name bytes, Sent downloads, tenant isolation and lost-response recovery. |
| `npm run test:staging -- --isolated` | Exit 0; 31 upgrade, rollback, backup/restore and alert checks. The injected division-by-zero is the expected rollback probe. |

The browser/staging commands above each completed an optimized production-mode
Next build with the new Sentry configuration. Local/CI synthetic configuration
does not upload sourcemaps. No standalone root build was run over the live
preview's `.next` directory.

New unit cases cover late responses after switching source emails, abort on
unmount, rejected action-status writes, and validated SSR-safe briefing storage.
The optional newer lint-config probe was not adopted: its additional lifecycle
rules require a separate legacy-screen migration. No lint rule was suppressed.

The first purchase-release run stopped with a loopback `ECONNRESET` after the
four frozen cases. It is retained as a failed attempt in
`test-results/technical-debt/purchase.log`; passing earlier cases does not make
that run pass. Transport diagnostics now include method/path and retain the
original cause without automatically retrying writes.
The complete fresh-fixture rerun exited 0 with 29 checks; the reset did not
recur. Its log is `test-results/technical-debt/purchase-recheck.log` and its
final report is `test-results/purchase-release/report.json`.

Logs: `test-results/technical-debt/`. See [cleanup scope, remaining debt and
rollback](TECHNICAL_DEBT_CLEANUP.md). Remote CI is separate evidence from these
local commands.
Removed the reusable `.next-build` after testing. No outside project copy or
venv was created. `docker image prune -f` reclaimed 0 B; the harness removed
its disposable fixture containers and networks. The existing preview and its
`.next` were retained.

Remote CI for `40c4c2f` passed all eight non-Chrome jobs and the purchase-release
step. Its later visual step failed before application startup: the pinned
purchase overlay had been pulled, but the base visual/platform images were
absent on the clean runner (`postgres:16` and `axllent/mailpit:v1.28.1`).
[Failed run and logs](https://github.com/nclamvn/inboxai-public/actions/runs/43855189497).
Added an explicit pull for the visual/platform compose set without skipping
any test. The same pull command exited 0 locally; fresh design and platform
reruns then exited 0 with 33 and 19 groups respectively. Logs:
`ci-image-pull.log`, `ci-design.log`, `ci-platform.log` under the cleanup evidence
directory. Removed `.next-build` again after these reruns; Docker image prune
ran again. These local results are not the next remote run's conclusion.

## Nâng cấp nhận diện bằng màu và icon

Ngày 16/11/2026, local macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79. Giữ navy/canvas/surface gốc, tăng màu ngữ nghĩa
ở icon đầu dòng, nhãn, count và vạch 2 px. Áp dụng vào Inbox, bộ lọc,
nhãn tìm kiếm/màn đọc, sổ cam kết, hồ sơ mua hàng và hồi đáp/bản nháp.

Thư giao dịch có cảnh báo giữ nhãn Giao dịch teal nhưng icon/vạch đỏ;
cam kết có nguồn mâu thuẫn dùng hổ phách, quá hạn đỏ, đã hủy trung tính.
Các nguồn, ranking và thao tác nghiệp vụ không bị thay đổi bởi màu sắc.
Nền tiêu đề sổ cam kết chuyển về surface trắng, giữ vạch navy thẳng.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run lint` | Exit 0; 0 lỗi, 92 cảnh báo cũ. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0; 252 test. |
| `npm run test:integration` | Exit 0; 200 test. |
| `npm run test:db` | Exit 0; 48 nhóm assertion SQL. |
| `npm run test:design -- --isolated` | Exit 0; 33 nhóm kiểm tra, có build production local. |
| `npm run test:commitment-ui -- --isolated` | Exit 0; 23 nhóm kiểm tra trên desktop, tablet, mobile, dark. |
| `npm run test:purchase-release` | Exit 0; 29 nhóm gồm luồng yêu cầu chứng từ đến duyệt xong, không gửi lặp. |

Bộ design kiểm trực tiếp năm màu icon/vạch khác nhau, có SVG và icon
contrast >= 3:1. Nhãn chữ đạt tối thiểu 5,18:1 ở light và 7,11:1 ở dark
trên các mẫu kiểm; kiểm axe không có vi phạm tại các màn đã chụp.
Tablet kiểm click vào chính ô icon để mở thư; desktop kiểm bàn phím,
focus/selection và đọc chia đôi. Có ảnh bộ lọc, compose, lỗi/trống và
ảnh mobile có quảng cáo/bản tin. Cam kết kiểm màu hổ phách cho dòng
nguồn mâu thuẫn đang mở và màu đỏ của nhóm quá hạn.

Chế độ commitment UI biệt lập mới ghi artifact vào
`test-results/commitment-ui/`, không ghi đè baseline trong docs hoặc dùng
`.next` của preview đang chạy. Không thêm dependency, ảnh raster hay
animation. Lượt build đầu dừng do type của icon section chưa nhận prop
size; đã dùng class kích thước đúng interface và chạy lại thành công.

`npm run test:platform -- --isolated` cuối exit 0, 19 nhóm kiểm tra
trên bản đã chỉnh vùng bấm icon. Các màn đã chụp không tràn ngang;
keyboard, đọc chia đôi và mở thư bằng ô icon đều qua.
Chỉ dùng dữ liệu giả lập, không push/deploy, không dùng email thật và
không tuyên bố tốc độ quét đã được đo với người dùng thật hoặc native.

Ảnh: `test-results/m6d/design/`, `test-results/commitment-ui/` và
`test-results/purchase-release/PO-9992-*.png`. Log lần này dùng tiền tố
`test-results/purchase-release/visual-`.
Xem [quy ước màu và icon](VISUAL_SIGNALS.md).
Đã dọn `.next-build`; `docker image prune -f` thu hồi 0 B. Giữ nguyên
preview cũ và các thay đổi local của milestone chứng từ trước đó.

## Yêu cầu bổ sung chứng từ và theo dõi đến khi duyệt xong

Ngày 16/11/2026, local macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79 và PostgreSQL 16. Hồ sơ mới PO-9992 dùng hai
Gmail giả lập cho Mua hàng và Kế toán; người ngoài hồ sơ không có mailbox.

Luồng nối trực tiếp thẻ hồ sơ trong Action Inbox với bản nháp Reply,
Sent, lịch theo dõi và rà chứng từ. Hồi đáp thiếu hạn thanh toán vẫn
để ngoại lệ mở; yêu cầu tiếp trả lời đúng email hồi đáp. Bàn giao chặn
nhắc cũ, và Kế toán duyệt bản đính chính mới dừng theo dõi.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run lint` | Exit 0, không có lỗi; 92 cảnh báo ở các file ngoài thay đổi này. |
| `npm run typecheck` | Exit 0. |
| `npm run test:unit` | Exit 0, 252 test. |
| `npm run test:integration` | Exit 0, 200 test. |
| `npm run test:db` | Exit 0, 48 dòng kết quả PASS; đây là nhóm assertion SQL, không phải 48 ca người dùng. |

Kiểm SQL mới xác nhận tạo lại cùng bản nháp, đúng nguồn, cách ly tài
khoản, phản hồi xác nhận chưa có chứng từ không khép ngoại lệ, chặn
lượt gửi sau bàn giao/khép và giữ receipt chưa rõ kết quả ở danh sách
đối chiếu dù hồ sơ đã khép. Quyền bảng private và RPC được kiểm trực tiếp.

Hồi quy trên bản cuối đã hoàn tất:

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:reply-workflow` | Exit 0, 23 nhóm kiểm tra. |
| `npm run test:reply-followup` | Exit 0, 20 nhóm kiểm tra. |
| `npm run test:design -- --isolated` | Exit 0, 29 nhóm kiểm tra. |
| `npm run test:platform -- --isolated` | Exit 0, 19 nhóm kiểm tra trình duyệt. |
| `npm run test:staging -- --isolated` | Exit 0, 31 nhóm kiểm tra nâng cấp, backup, restore và cảnh báo. |

`npm run test:purchase-release` cuối cùng exit 0, 29 nhóm kiểm tra,
gồm bốn nhóm mới của PO-9992. Build Next production local tạo 122
trang/route. Assertion kết thúc chờ Inbox tải các hồ sơ còn mở trước
khi xác nhận PO-9992 đã biến mất, tránh PASS trên màn chưa tải dữ liệu.

Ba thư trong kịch bản mới: yêu cầu đầu, một thư nhắc đã duyệt, yêu cầu
bổ sung tiếp. Mất phản hồi tạo bản nháp, mất receipt của Gmail giả lập,
mất phản hồi của trình duyệt và hai lần khởi động lại Next không tạo
thêm lượt gửi. Nhắc ngày mới chỉ xuất hiện sau dời hẹn và đổi đồng hồ
kiểm thử. Hồi đáp ở hộp Kế toán không đáp ứng yêu cầu ở Mua hàng.
Tệp thiếu hạn không được ghi, bản sửa hợp lệ trỏ đúng email và phần
đính kèm; sau Kế toán duyệt, ngoại lệ khép và lịch theo dõi được dừng.
Bốn ảnh mới và 10 ảnh hồi quy đã qua axe và kiểm tra không tràn ngang.
Đã kiểm ảnh desktop, dialog nhắc, mobile 390 px và màn Kế toán duyệt xong.

Lượt đầu dừng do bộ chọn chữ trong bài test tìm nhãn thiếu hạn thanh toán
không đúng với chi tiết đang thu gọn. Đã mở đúng chi tiết và dùng nhãn
hiện hành; không thay đổi điều kiện chặn tệp thiếu hạn để làm test qua.

Chỉ dùng loopback và fixture, không push, deploy, email thật hay gọi model
thương mại. Không có số đo mới từ người dùng thật hoặc bằng chứng về
production, native device hay tính tương thích Gmail thật. Bốn hồ sơ
benchmark và nhãn đã khóa giữ nguyên; PO-9992 là kịch bản tích hợp mới.

Xem [phạm vi và tiêu chí nghiệm thu](PURCHASE_EVIDENCE_REQUESTS.md).
Log và ảnh nằm trong `test-results/purchase-release/` với tiền tố
`request-` và `PO-9992-`. Đã xóa `.next-build` sinh trong lượt này;
`docker image prune -f` thu hồi 0 B. Không prune container hoặc volume
của người dùng, không tạo bản sao dự án hay scratch ngoài repository.

## Rà soát chứng từ có thể tiếp tục sau gián đoạn

Ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79, PostgreSQL 16 và hai Gmail giả lập qua loopback.
`npm run test:purchase-release` exit 0 với 25 kiểm tra, gồm ba nhóm
mới trên hồ sơ PO-9984 với 24 phần đính kèm CSV.

- Mất phản hồi sau khi PostgreSQL ghi một lượt rà, trong lúc Chrome
  ngắt mạng và khởi động lại tiến trình Next.js. Trang tải lại hiện
  6/24 tệp. Số lượt đọc phần đính kèm từ Gmail giả lập vẫn là sáu.
  Giả lập Gmail ngắt kết nối cũng giữ nguyên 6/24 và báo lý do.
- Đồng bộ lại một phần đính kèm đã đổi kích thước. Trang hiện 5/24.
  Lượt kế tiếp đọc lại đúng phần đổi cùng năm phần chưa rà. Hoàn tất
  24 tệp với 25 lần đọc phần đính kèm. Bản B được phát hiện ngoài
  sáu tệp đầu và chặn yêu cầu duyệt A khi B còn chưa ghi vào sổ.
- Sau bàn giao B, trạng thái rà của A không ghi được vào phiên bản
  mới. Mua hàng rà tiếp 12 tệp còn trong phạm vi B. Kế toán chỉ đọc
  lại chứng từ đã bàn giao và duyệt đúng một lần. Quyết định sau
  tải lại vẫn trỏ đúng email và phần đính kèm. Người ngoài hồ sơ
  không đọc hay ghi được tiến độ qua API.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-release` | Exit 0. 25 kiểm tra. Build production hoàn tất 121 bước tạo trang. |
| `npm run test:purchase-supplements` | Exit 0. 41 kiểm tra hồi quy. |
| `npm run test:design -- --isolated`, `npm run test:platform -- --isolated` | Exit 0. 29 và 19 kiểm tra. |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục. |
| `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:db` | Exit 0. Còn 92 cảnh báo lint cũ. 252 unit, 200 integration và 47 nhóm database. |

Lượt thử đầu phát hiện giao diện tự thử lại lần ghi khi mất phản hồi.
Đã tắt thử lại tự động cho nút rà. Bộ thử cũng được chỉnh để chờ hết
nhóm có bản B vì các phần cùng email có cùng mốc thời gian nguồn.
Hai ảnh mới qua axe và kiểm tra tràn ngang. Toàn bộ kiểm thử ở local
với dữ liệu giả lập. [Cách rà tiếp và điều kiện duyệt](PURCHASE_LOCAL_RELEASE.md#tiếp-tục-rà-soát-sau-gián-đoạn).

## Chặn duyệt bản cũ khi có chứng từ đính chính

Ngày 15/11/2026 trên macOS arm64, Node 24.14.1, Next.js 16.4.6,
Chrome 157.0.8103.79, PostgreSQL 16 và hai hộp Gmail giả lập qua
loopback. Luồng chạy cùng `npm run test:purchase-release`, exit 0
với 22 kiểm tra, gồm ba nhóm mới sau bộ bốn hồ sơ đã khóa.

- PO-9974 vẫn duyệt được bản đang chờ khi có thư sai người gửi, thư
  cùng nhà cung cấp nhưng vào hộp Kế toán, sai PO, sai thứ tự hoặc
  tệp gửi lại nguyên byte. RPC cũ thiếu dấu kiểm tra danh sách trả
  lỗi và không ghi quyết định.
- PO-9978 giữ tab Kế toán cũ. Fixture tạm dừng lượt đọc một tệp sau
  khi máy chủ đã lấy danh sách ứng viên. Trong lúc dừng, Gmail đồng
  bộ bản B hợp lệ. Yêu cầu cũ trả 409, dù Mua hàng chưa ghi nhận B.
  Không có quyết định cho A. Kế toán cũng không tải được phần tệp B
  chưa giao, và người ngoài không thể duyệt hồ sơ.
- Mua hàng mở đúng phần đính kèm B từ Inbox, ghi nhận và bàn giao.
  Tab cũ mất nút duyệt sau tải lại. Khi giả lập mất phản hồi ở lần
  duyệt B, thao tác thử lại giữ nguyên mã yêu cầu, mã biên nhận và
  đúng một sự kiện duyệt. Sau tải lại, sổ trỏ đúng ID thư và ID tệp.

| Lệnh | Kết quả local |
| --- | --- |
| `npm run test:purchase-release` | Exit 0. 22 kiểm tra. Build production hoàn tất 121 bước tạo trang. |
| `npm run test:purchase-supplements` | Exit 0. 41 kiểm tra hồi quy. |
| `npm run test:staging -- --isolated` | Exit 0. 31 kiểm tra nâng cấp, sao lưu và khôi phục. |
| `npm run lint`, `npm run typecheck` | Exit 0. Lint còn 92 cảnh báo cũ. |
| `npm run test:unit`, `npm run test:integration`, `npm run test:db` | Exit 0. 252 unit, 200 integration và 47 nhóm database. |

Lượt đầu xác nhận 409 nhưng dừng vì bộ thử tìm cảnh báo sai vai trò
trợ năng. Đã sửa bộ chọn theo vai trò `status` của cảnh báo hiện có.
Lượt chốt còn xác nhận hai ảnh Chrome qua axe và kiểm tra tràn ngang.
Không dùng Gmail thật, không push hay deploy.
[Quy tắc kiểm tra trước duyệt](PURCHASE_LOCAL_RELEASE.md#chặn-duyệt-bản-cũ-khi-có-đính-chính).

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
