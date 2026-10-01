# BÁO CÁO TỔNG KẾT MILESTONE 1: THIN ORCHESTRATION BRIDGE
**Dự án:** Multi-Agent Autonomous Orchestrator Bridge (`orchestrator-bridge`)  
**Phiên bản:** `0.1.0`  
**Ngày báo cáo:** 01/10/2026  
**Trạng thái hoàn thành:** ✅ **100% ĐẠT MỤC TIÊU (78/78 Unit & Integration Tests Passed • 0 Lỗi TypeScript)**

---

## 1. TỔNG QUAN DỰ ÁN & MỤC TIÊU MILESTONE 1

### 1.1. Bối cảnh & Mục tiêu dự án
Dự án **Thin Orchestration Bridge** ra đời nhằm giải quyết bài toán kết nối và phối hợp tự động giữa 3 công cụ CLI AI hàng đầu hiện nay:
- **AGY CLI (`agy`)**: Đảm nhiệm vai trò kiến trúc sư lập kế hoạch (**Planner**).
- **OpenCode CLI (`opencode`)**: Đảm nhiệm vai trò lập trình viên trực tiếp triển khai code và kiểm thử cục bộ (**Implementer**).
- **Codex CLI (`codex`)**: Đảm nhiệm vai trò thẩm định viên độc lập kiểm tra chất lượng và tiêu chuẩn nghiệm thu (**Verifier / Reviewer**).

Thay vì để các agent gọi trực tiếp lẫn nhau (gây phụ thuộc chéo và phức tạp hóa luồng điều khiển), **Bridge** đóng vai trò là một tiến trình trung gian gọn nhẹ (Thin Orchestration Bridge) vận hành trên nền tảng **Node.js / TypeScript**, giao tiếp với các CLI thông qua các hợp đồng dữ liệu chuẩn hóa (**Data Contracts**), gói chuyển giao ngữ cảnh tinh gọn (**Handoff Packets**), và lưu trữ trạng thái minh bạch trên hệ thống tệp tin (**File-based State Store**).

### 1.2. Mục tiêu trọng tâm của Milestone 1
Trong Milestone 1, toàn bộ các thành phần nền tảng cốt lõi của hệ thống đã được xây dựng hoàn thiện:
1. **Thiết lập Data Contract & Protocol**: Định nghĩa chuẩn mực các schema dữ liệu cho tác vụ (`TaskEnvelope`), kết quả thực thi (`AgentResult`), và gói chuyển giao (`AgentHandoff`).
2. **Xây dựng bộ phân tích dữ liệu siêu bền bỉ (Robust Parsing Engine)**: Tự động trích xuất JSON, hỗ trợ NDJSON Streaming từ các CLI, nhận diện thay đổi file/lệnh thực thi, và xử lý suy biến/fallback.
3. **Cơ chế quản lý tiến trình an toàn (Process Supervisor)**: Giám sát toàn bộ tiến trình con, timeout, bắt lỗi và dọn dẹp cây tiến trình triệt để trên cả Windows (`taskkill /T /F`) và POSIX.
4. **Hệ thống Adapter chuyên biệt**: Tích hợp trực tiếp cho `agy`, `opencode`, `codex`, cùng `mock` adapter phục vụ kiểm thử mô phỏng zero-token.
5. **Bộ định tuyến & Máy trạng thái xác định (Static Router & Finite State Machine)**: Quản lý Golden Workflow và vòng lặp phản hồi sửa lỗi thẩm định (Verification Retry Loop) có kiểm soát giới hạn (`maxVerificationLoops`).
6. **Lưu trữ trạng thái & Kiểm toán (FileStateStore)**: Ghi lại lịch sử chạy, sự kiện (`events.jsonl`), snapshot tác vụ, và log thô dưới thư mục `.orchestrator/runs/<runId>/`.
7. **Cấu hình Model linh hoạt & Dynamic Model Discovery**: Quản lý cấu hình 4 tầng ưu tiên, tự động khám phá model từ các CLI, menu tương tác bằng phím mũi tên.
8. **Trải nghiệm Terminal nâng cao (Interactive CLI UX)**: Hỗ trợ nhập prompt đa dòng (`Shift + Enter`, `Alt + Enter`), thuật toán tính toán độ rộng ký tự hiển thị và số dòng line-wrapping chính xác, loại bỏ triệt để hiện tượng vỡ giao diện / duplicate render.
9. **Đảm bảo chất lượng (QA)**: Đạt 78/78 automated test cases và 100% clean TypeScript strict compilation.

---

## 2. KIẾN TRÚC HỆ THỐNG & GOLDEN WORKFLOW

### 2.1. Sơ đồ kiến trúc phân tầng (Layered Architecture)

```text
                             ┌──────────────────────────────────────┐
                             │       USER (CLI / Interactive)       │
                             └──────────────────┬───────────────────┘
                                                │ Objective Prompt
                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                THIN ORCHESTRATION BRIDGE                               │
│                                                                                        │
│   ┌────────────────────┐    ┌─────────────────────┐    ┌───────────────────────────┐   │
│   │    CLI Interface   │───▶│   Runner Engine     │───▶│       Static Router       │   │
│   │ (prompt / config)  │    │  (Loop Controller)  │    │ (Role Mapping / Decisions)│   │
│   └────────────────────┘    └──────────┬──────────┘    └───────────────────────────┘   │
│                                        │                                               │
│                                        ▼                                               │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                                 Bridge Core                                    │   │
│   │   - Task Dispatcher         - Output Parser (NDJSON/JSON)   - Handoff Builder  │   │
│   └────────────────────────────────────┬───────────────────────────────────────────┘   │
│                                        │                                               │
│         ┌──────────────────────────────┼──────────────────────────────┐                │
│         ▼                              ▼                              ▼                │
│   ┌───────────────┐              ┌───────────────┐              ┌───────────────┐      │
│   │  Agy Adapter  │              │OpenCodeAdapter│              │ Codex Adapter │      │
│   └───────┬───────┘              └───────┬───────┘              └───────┬───────┘      │
│           │                              │                              │              │
│           └──────────────────────────────┼──────────────────────────────┘              │
│                                          │                                             │
│                                          ▼                                             │
│                             ┌─────────────────────────┐                                │
│                             │   Process Supervisor    │                                │
│                             │ (Cross-Platform Spawner)│                                │
│                             └────────────┬────────────┘                                │
└──────────────────────────────────────────┼─────────────────────────────────────────────┘
                                           │
             ┌─────────────────────────────┼─────────────────────────────┐
             ▼                             ▼                             ▼
       ┌───────────┐                 ┌───────────┐                 ┌───────────┐
       │  agy CLI  │                 │opencodeCLI│                 │ codex CLI │
       └───────────┘                 └───────────┘                 └───────────┘
```

### 2.2. Vòng đời Golden Workflow & Vòng lặp thẩm định

```text
               USER (Objective Prompt)
                          │
                          ▼
                   ┌─────────────┐
                   │     AGY     │  (Planner)
                   │   Planner   │  Phân tích yêu cầu, đề xuất kiến trúc & Acceptance Criteria
                   └──────┬──────┘
                          │ TaskEnvelope (Handoff 01)
                          ▼
                   ┌─────────────┐
                   │  OpenCode   │◄─────────────────────────┐
                   │ Implementer │                          │
                   └──────┬──────┘                          │
                          │ Files changed + Test evidence   │ (Verification FAIL)
                          │ (Handoff 02)                    │ Vòng lặp iteration <= 3
                          ▼                                 │
                   ┌─────────────┐                          │
                   │    Codex    │                          │
                   │  Verifier   │  Thẩm định độc lập, chạy test, đối chiếu tiêu chí
                   └──────┬──────┘                          │
                          │                                 │
                      [Verdict]                             │
                      /       \                             │
             (PASS)  /         \ (FAIL)                     │
                    ▼           ▼                           │
               [ COMPLETED ] [ Iteration <= 3? ] ─── CÒN ───┘
                                    │
                                    │ HẾT (> 3)
                                    ▼
                            [ HUMAN_REQUIRED ]
```

---

## 3. CHI TIẾT CÁC TÍNH NĂNG & MODULE ĐÃ HOÀN THÀNH

### 3.1. Giao thức Dữ liệu & Bóc tách kết quả (`src/protocol/`)

#### A. Cấu trúc dữ liệu chuẩn mực
- **`TaskEnvelope.ts`**: Đóng gói đầy đủ thông tin giao việc cho một tác tử:
  - `taskId`, `runId`, `objective`, `workingDirectory`.
  - `acceptanceCriteria`: Danh sách tiêu chuẩn nghiệm thu rõ ràng.
  - `requestedRole`: Vai trò chỉ định (`planner`, `implementer`, `verifier`, v.v.).
  - `context`: Ngữ cảnh cô đọng chuyển giao từ bước trước.
  - `iteration` / `maxIterations`: Đếm số vòng lặp sửa lỗi hiện tại.
  - `inputs`: Danh sách tệp tin liên quan đầu vào.
  - `previousResults`: Lịch sử tóm tắt các bước đã thực hiện.
- **`AgentResult.ts`**: Chuẩn hóa dữ liệu trả về từ bất kỳ tác tử nào:
  - `status`: `"completed" | "blocked" | "failed" | "needs_followup"`.
  - `summary`: Tóm tắt công việc đã thực hiện.
  - `findings`: Các phát hiện kỹ thuật cốt lõi.
  - `filesChanged`: Danh sách các tệp tin đã tạo hoặc chỉnh sửa.
  - `commandsExecuted`: Các câu lệnh đã chạy kiểm thử/biên dịch.
  - `verification`: Kết quả thẩm định (`passed: boolean`, `evidence: string[]`).
  - `nextAction`: Khuyến nghị tác tử tiếp theo và chỉ dẫn cụ thể.
  - `durationMs`, `rawOutput`: Thông số hiệu năng và log thô.
- **`AgentHandoff.ts` & `HandoffBuilder.ts`**:
  - Giải quyết bài toán **Quadratic Transcript Explosion**: Thay vì nhồi toàn bộ lịch sử trò chuyện hàng chục nghìn token vào prompt của agent tiếp theo, `HandoffBuilder` trích xuất thông tin cô đọng (1-2k tokens) gồm: lý do chuyển giao, tóm tắt bước trước, findings chính, danh sách file sửa đổi, và tiêu chí nghiệm thu cần giải quyết.

#### B. Bộ phân tích cú pháp siêu bền bỉ (`extractAndParseJson` trong `schemas.ts`)
- **Hỗ trợ NDJSON Streaming**: Khi tác tử (như `opencode`) xuất dữ liệu dạng dòng JSON nối tiếp (stream event), parser tự động đọc từng dòng, nhận diện sự kiện `tool_use`, bóc tách các file được ghi/sửa (`write`, `edit`, `patch`) và các câu lệnh shell được thực thi (`shell`, `bash`, `cmd`), đồng thời tổng hợp nội dung văn bản cuối cùng.
- **Bóc tách đa định dạng**:
  - Nhận diện trực tiếp JSON hợp lệ.
  - Bóc tách khối Markdown fenced code blocks: ````json { ... } ````.
  - Tìm kiếm cặp ngoặc nhọn ngoài cùng `{ ... }` khi JSON nằm lẫn trong các câu hội thoại tự nhiên.
  - Nhận diện các thông báo lỗi tiến trình (`error`, `type: "error"`) và chuyển đổi thành trạng thái `blocked` hoặc `failed` có ý nghĩa.
  - Cung cấp cơ chế Fallback an toàn: Không bao giờ làm crash ứng dụng nếu agent in ra output không hợp lệ, tự động gán giá trị mặc định kèm log thô.

---

### 3.2. Giám sát & Quản trị tiến trình (`src/process/ProcessSupervisor.ts`)

- **Thực thi đa nền tảng tối ưu (Windows & POSIX)**:
  - Phát hiện lệnh binary: Tự động phân biệt giữa file thực thi trực tiếp (như `agy` hoặc các file `.exe`) và các wrapper script cần shell trên Windows (như `opencode.cmd`, `codex.cmd`).
  - Xử lý tham số an toàn trên Windows với cơ chế escape ký tự đặc biệt (`escapeCmdArg`), ngăn ngừa lỗi command injection và lỗi ngắt chuỗi khi có khoảng trắng.
- **Kiểm soát vòng đời & Timeout chặt chẽ**:
  - Thiết lập timeout cấu hình được (mặc định 300,000ms / 5 phút).
  - Tự động đánh dấu trạng thái `TIMEOUT` khi tiến trình vượt quá thời gian cho phép.
- **Dọn dẹp cây tiến trình triệt để (Process Tree Cleanup)**:
  - **Trên Windows**: Thực thi `taskkill /pid <PID> /T /F` để tiêu diệt tận gốc toàn bộ cây tiến trình con (con của con) tránh hiện tượng zombie process hoặc chiếm dụng cổng/file.
  - **Trên POSIX**: Gửi tín hiệu `SIGTERM`, sau 3 giây nếu chưa kết thúc sẽ cưỡng chế bằng `SIGKILL`.
- **Luồng I/O thời gian thực**: Hỗ trợ truyền stdin (dành cho `codex exec -`), lắng nghe sự kiện `stdout` / `stderr` theo stream, và đo lường chính xác `durationMs`.

---

### 3.3. Tầng Adapter của các Agent (`src/agents/`)

| Adapter | CLI Tương ứng | Vai trò mặc định | Tham số & Cơ chế gọi | Xử lý Prompt & Đầu ra |
| :--- | :--- | :--- | :--- | :--- |
| **`AgyAdapter`** | `agy` | `planner` | `agy --output-format json --dangerously-skip-permissions [--model <model>] -p "<prompt>"` | Tải template từ `prompts/planner.md`, sinh JSON kế hoạch kiến trúc & Acceptance Criteria |
| **`OpenCodeAdapter`** | `opencode` | `implementer` | `opencode run -m <model> --auto --format json` (truyền prompt qua stdin) | Tải template từ `prompts/implementer.md`, thực thi code/test thực tế, trích xuất NDJSON tools |
| **`CodexAdapter`** | `codex` | `verifier` | `codex exec -m <model> --dangerously-bypass-approvals-and-sandbox -o <tempJson> -` (stdin) | Tải template từ `prompts/verifier.md`, đọc kết quả từ file output hoặc stdout, trích xuất verdict |
| **`MockAdapter`** | *(Bộ mô phỏng)* | *(Tùy chọn)* | Chạy giả lập trong bộ nhớ với độ trễ thực tế (~50ms) | Cho phép kiểm thử tự động, mô phỏng lỗi xác minh thất bại N lần (`simulateVerificationFailureCount`) |

---

### 3.4. Định tuyến & Điều phối vòng lặp (`src/routing/` & `src/bridge/`)

- **`StaticRouter.ts`**:
  - Ánh xạ vai trò sang tác tử ưu tiên: `planner -> agy`, `implementer -> opencode`, `verifier -> codex`.
  - Hỗ trợ cơ chế dự phòng linh hoạt (Fallback Preference List) khi một tác tử không khả dụng.
  - **Máy trạng thái điều hướng (Finite State Machine)**:
    - `planner (completed)` ──▶ Chuyển tiếp sang `implementer`.
    - `implementer (completed)` ──▶ Chuyển tiếp sang `verifier`.
    - `verifier (passed = true)` ──▶ Kết thúc thành công (`COMPLETED`).
    - `verifier (passed = false)`:
      - Nếu `currentIteration < maxVerificationLoops`: Quay lại `implementer` kèm bằng chứng lỗi để sửa lại code.
      - Nếu `currentIteration >= maxVerificationLoops`: Dừng hệ thống và nâng cờ cảnh báo `HUMAN_REQUIRED`.
    - Bất kỳ agent nào trả về `blocked` hoặc `failed`: Dừng an toàn với trạng thái tương ứng.
- **`Runner.ts`**:
  - Điều phối chu trình end-to-end từ lúc khởi tạo `task-01` cho đến khi đạt trạng thái kết thúc.
  - Cung cấp các Event Hooks: `onStepStart`, `onStepComplete`, `onHandoff`.
  - Tích hợp bắt tín hiệu ngắt `SIGINT` (Ctrl+C) để hủy tiến trình con và cập nhật trạng thái `CANCELLED` gọn gàng.

---

### 3.5. Lưu trữ trạng thái phiên chạy (`src/state/FileStateStore.ts`)

Mọi thông tin trong suốt quá trình chạy được lưu trữ độc lập và minh bạch trong thư mục `.orchestrator/runs/<runId>/`:

```text
.orchestrator/
└── runs/
    └── run-2026-10-01T01-30-00/
        ├── run.json                  # Metadata tổng quát: runId, objective, status, thời lượng, kết quả cuối
        ├── events.jsonl              # Nhật ký sự kiện append-only ghi lại toàn bộ timeline
        ├── tasks/                    # Lưu trữ chi tiết từng TaskEnvelope
        │   ├── task-01.json
        │   ├── task-02.json
        │   └── task-03.json
        ├── results/                  # Lưu trữ kết quả có cấu trúc AgentResult
        │   ├── task-01.agy.json
        │   ├── task-02.opencode.json
        │   └── task-03.codex.json
        ├── handoffs/                 # Lưu trữ các gói chuyển giao Handoff
        │   ├── handoff-task-01-xxx.json
        │   └── handoff-task-02-yyy.json
        └── logs/                     # Log thô stdout/stderr từ các CLI để phục vụ audit/debug
            ├── task-01.agy.log
            ├── task-02.opencode.log
            └── task-03.codex.log
```

---

### 3.6. Quản lý cấu hình Model linh hoạt (`src/utils/config.ts`)

#### A. Thứ tự ưu tiên 4 tầng (Priority Cascade)
Hệ thống tự động giải quyết model cho từng agent theo thứ tự từ cao xuống thấp:
1. **Tham số dòng lệnh (CLI Flags)**: `--agy-model <m>`, `--opencode-model <m>`, `--codex-model <m>`.
2. **Biến môi trường (Environment Variables)**: `AGY_MODEL`, `OPENCODE_MODEL`, `CODEX_MODEL`.
3. **File cấu hình dự án**: `.orchestrator/config.json`.
4. **Cấu hình mặc định tối ưu (Default Models)**:
   - `agy`: `gemini-3.8-flash`
   - `opencode`: `agnes/agnes-2.5-flash`
   - `codex`: `gpt-5.6-terra`

#### B. Dynamic Model Discovery (Khám phá Model động)
- **AGY**: Gọi lệnh `agy models`, tự động phân tích danh sách model thời gian thực từ Google.
- **Codex**: Đọc trực tiếp cache mô hình tại `~/.codex/models_cache.json`.
- **OpenCode**: Gọi lệnh `opencode models` để lấy danh sách model và provider hiện hành.
- **Fallback an toàn**: Khi offline hoặc CLI chưa cấu hình API, hệ thống tự động cung cấp danh sách model phổ biến đã được kiểm chứng.
- **Custom Model**: Cho phép người dùng nhập bất kỳ model ID tùy chỉnh nào.

---

### 3.7. Giao diện dòng lệnh & Trải nghiệm người dùng (`src/cli.ts` & `src/utils/prompt.ts`)

#### A. Menu tương tác cấu hình Model bằng phím mũi tên (`promptSelect`)
- Vận hành trực tiếp trên terminal thuần (Zero external dependencies).
- Hỗ trợ di chuyển `↑` / `↓` (hoặc `k` / `j`), chọn bằng `Enter`, hủy bằng `Esc` hoặc `Ctrl+C`.
- Tự động cuộn phân trang (`pageSize: 10`), hiển thị gợi ý model đang chọn `(Đang chọn)`.
- Hỗ trợ phím tắt số `1-9` để nhảy nhanh, `Home`/`End`, `PageUp`/`PageDown`.
- Khi hoàn tất, menu được xóa sạch sẽ và hiển thị một dòng tóm tắt kết quả gọn gàng (`✔ Chọn model cho 'opencode': ...`).

#### B. Nhập Prompt đa dòng không lỗi hiển thị (`promptUserForObjective`)
- **Phím tắt nhập liệu**:
  - `Enter`: Bắt đầu thực thi pipeline.
  - `Shift + Enter` hoặc `Alt + Enter` hoặc `Ctrl + Enter`: Xuống dòng mới (hỗ trợ nhập yêu cầu dài, nhiều gạch đầu dòng).
  - `Ctrl + C`: Hủy và thoát an toàn.
  - `Ctrl + U`: Xóa toàn bộ văn bản đang nhập.
  - `Backspace`: Xóa ký tự an toàn với chuỗi UTF-8 đa byte.
- **Nhận diện phím chuẩn xác**: Hỗ trợ đầy đủ các giao thức terminal hiện đại bao gồm CSI u protocol (`\x1b[13;2u`), Kitty terminal, xterm modifyOtherKeys, và Alt+Enter escape sequence (`\x1b\r`).

#### C. Thuật toán xử lý Line-Wrapping & Độ rộng trực quan (Visual Width Engine)
- **`getStringVisualWidth(str)`**:
  - Loại bỏ các mã màu ANSI escape code.
  - Nhận diện ký tự kết hợp dấu tiếng Việt (Combining Diacritics - Unicode `0x0300`-`0x036F`) có độ rộng là **0**.
  - Nhận diện ký tự toàn phần (Fullwidth), East Asian Wide, và Emoji đa byte (`0x1F300`-`0x1FAFF`) có độ rộng là **2 cột**.
  - Nhận diện ký tự ASCII và ký tự đơn có độ rộng là **1 cột**.
- **`getPhysicalRowCount(formattedText, columns)`**:
  - Tính toán số dòng vật lý thực tế mà terminal cần sử dụng khi văn bản bị wrap dòng theo chiều rộng cột (`stdout.columns`).
  - Đưa con trỏ ngược lên chính xác `-(previousPhysicalRowCount - 1)` dòng và xóa xuống (`clearScreenDown`).
  - **Kết quả**: Khắc phục triệt để 100% lỗi duplicate prompt, vỡ layout, hoặc nhảy con trỏ khi người dùng gõ văn bản dài vượt quá chiều ngang terminal.

#### D. Các lệnh CLI hỗ trợ
- `npm start` (hoặc `bridge`): Khởi động chế độ tương tác nhập prompt trực quan.
- `npm start --config` (hoặc `bridge config`): Mở menu chọn và lưu cấu hình model.
- `npm run check` (hoặc `bridge check`): Chẩn đoán kiểm tra tình trạng cài đặt và khả dụng của 3 CLI trong biến môi trường PATH.
- `npm run status` (hoặc `bridge status`): Xem dashboard tiến trình, timeline sự kiện và kết quả của phiên chạy gần nhất.
- `npm start -- run "<objective>" --mock`: Chạy chế độ giả lập mô phỏng zero token.
- `npm start -- run "<objective>" --mock --simulate-fail 1`: Mô phỏng 1 lần verification fail để quan sát vòng lặp sửa lỗi tự động.

---

### 3.8. Tiện ích dùng chung (`src/utils/checksum.ts` & `src/utils/validator.ts`)

- **`checksum.ts`**:
  - `calculateSha256(filePath)`: Tính mã băm SHA-256 của tệp tin sử dụng Node.js Streams (`pipeline`), tiết kiệm RAM khi xử lý tệp tin lớn.
  - `verifyChecksum(filePath, expectedChecksum)`: Xác minh tính toàn vẹn của tệp tin so với mã checksum mong muốn, tự động chuẩn hóa chữ thường và loại bỏ khoảng trắng thừa.
- **`validator.ts`**:
  - `sanitizeFilename(name)`: Loại bỏ các ký tự cấm trên hệ điều hành (`<>:"/\|?*`), ngăn chặn triệt để tấn công Path Traversal (`../`, `..\`), giới hạn độ dài an toàn 200 ký tự.
  - `isValidRunId(runId)`: Xác thực định dạng ID phiên chạy theo chuẩn `run-YYYY-MM-DDTHH-MM-SS`.
  - `validateNonEmptyString(val, fieldName)`: Kiểm tra chuỗi không được rỗng và tự động cắt tỉa khoảng trắng.

---

## 4. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG & BẢO ĐẢM CHẤT LƯỢNG

Toàn bộ hệ thống được bảo vệ bởi bộ kiểm thử tự động toàn diện được viết bằng trình chạy kiểm thử gốc của Node.js (`node:test` + `tsx`).

### 4.1. Thống kê kết quả kiểm thử (`npm test`)

```text
▶ checksum utilities (9 tests) ........................................ PASSED (552ms)
▶ Model Configuration Management (9 tests) ............................. PASSED (165ms)
▶ Prompt Utilities & Key Detection (17 tests) .......................... PASSED (129ms)
▶ Protocol & Schemas (6 tests) ......................................... PASSED (29ms)
▶ StaticRouter (8 tests) ............................................... PASSED (13ms)
▶ Runner (Autonomous End-to-End Orchestration) (3 tests) ................ PASSED (1927ms)
▶ FileStateStore (2 tests) ............................................. PASSED (206ms)
▶ sanitizeFilename (11 tests) .......................................... PASSED (11ms)
▶ isValidRunId (5 tests) ............................................... PASSED (5ms)
▶ validateNonEmptyString (8 tests) ..................................... PASSED (15ms)

----------------------------------------------------------------------------------------
ℹ Tổng số Test Suites : 10 suites
ℹ Tổng số Test Cases  : 78 tests
ℹ Kết quả             : 78 PASSED / 0 FAILED / 0 SKIPPED
ℹ Thời gian thực thi  : ~3.2 giây
----------------------------------------------------------------------------------------
```

### 4.2. Kiểm tra tính hợp lệ TypeScript (`npm run typecheck`)
- Lệnh thực thi: `tsc --noEmit`
- Kết quả: **0 cảnh báo, 0 lỗi biên dịch**. Toàn bộ mã nguồn tuân thủ nghiêm ngặt chuẩn `strict: true` của TypeScript (ES2022 / NodeNext).

---

## 5. TỔNG HỢP CÁC FILE ĐÃ TRIỂN KHAI TRONG MILESTONE 1

```text
mvp-agent-auto/
├── docs/
│   ├── 01-VISION.md                 # Tầm nhìn, ranh giới và các non-goals
│   ├── 02-AGENT-CONTRACT.md         # Quy chuẩn dữ liệu TaskEnvelope & AgentResult
│   ├── 03-HANDOFF-PROTOCOL.md       # Quy tắc nén ngữ cảnh Handoff Packet
│   ├── 04-AGENT-CAPABILITIES.md     # Đặc tả CLI invocation và vai trò
│   ├── 05-WORKFLOW.md               # Luồng Golden Workflow & Vòng lặp thẩm định
│   └── 06-FAILURE-POLICY.md         # Ma trận xử lý lỗi và chính sách phục hồi
├── prompts/
│   ├── planner.md                   # Chỉ dẫn hệ thống cho AGY (Planner)
│   ├── implementer.md               # Chỉ dẫn hệ thống cho OpenCode (Implementer)
│   ├── verifier.md                  # Chỉ dẫn hệ thống cho Codex (Verifier)
│   └── handoff.md                   # Template định dạng ngữ cảnh chuyển giao
├── src/
│   ├── agents/
│   │   ├── AgentAdapter.ts          # Interface chung & hàm buildAgentPrompt
│   │   ├── AgyAdapter.ts            # Tích hợp AGY CLI
│   │   ├── CodexAdapter.ts          # Tích hợp Codex CLI
│   │   ├── OpenCodeAdapter.ts       # Tích hợp OpenCode CLI
│   │   └── MockAdapter.ts           # Trình giả lập phục vụ test offline
│   ├── bridge/
│   │   ├── Bridge.ts                # Cầu nối thực thi bước tác vụ
│   │   ├── HandoffBuilder.ts        # Biên dịch Handoff Packet tinh gọn
│   │   └── Runner.ts                # Bộ điều phối vòng đời end-to-end
│   ├── process/
│   │   └── ProcessSupervisor.ts     # Giám sát tiến trình đa nền tảng
│   ├── protocol/
│   │   ├── AgentHandoff.ts          # Type định nghĩa Handoff Packet
│   │   ├── AgentResult.ts           # Type định nghĩa AgentResult
│   │   ├── TaskEnvelope.ts          # Type định nghĩa TaskEnvelope
│   │   └── schemas.ts               # JSON Schema & Robust JSON/NDJSON Parsers
│   ├── routing/
│   │   └── StaticRouter.ts          # Máy trạng thái định tuyến & đếm vòng lặp
│   ├── state/
│   │   └── FileStateStore.ts        # Quản lý lưu trữ file .orchestrator
│   ├── utils/
│   │   ├── checksum.ts              # Tính toán & kiểm tra SHA-256
│   │   ├── config.ts                # Quản lý cấu hình model & Dynamic Discovery
│   │   ├── prompt.ts                # Xử lý terminal, phím mũi tên & multiline prompt
│   │   └── validator.ts             # Làm sạch tên file & kiểm tra hợp lệ
│   ├── cli.ts                       # Entrypoint giao diện dòng lệnh chính
│   └── index.ts                     # Thư viện export chính
├── tests/
│   ├── checksum.test.ts             # 9 tests cho checksum utilities
│   ├── config.test.ts               # 9 tests cho cấu hình model & menu helpers
│   ├── prompt.test.ts               # 17 tests cho xử lý phím, độ rộng chữ & menu
│   ├── protocol.test.ts             # 6 tests cho bóc tách JSON & NDJSON streams
│   ├── routing.test.ts              # 8 tests cho máy trạng thái StaticRouter
│   ├── runner.test.ts               # 3 tests tích hợp cho Runner & Retry Loop
│   ├── state.test.ts                # 2 tests cho FileStateStore & events
│   └── validator.test.ts            # 24 tests cho sanitizeFilename & validators
├── package.json                     # Cấu hình dự án, scripts & dependencies
├── tsconfig.json                    # Cấu hình trình biên dịch TypeScript
└── README.md                        # Hướng dẫn sử dụng & tài liệu tổng quan
```

---

## 6. ĐÁNH GIÁ & ĐỊNH HƯỚNG MILESTONE 2

### 6.1. Đánh giá kết quả Milestone 1
- **Độ tin cậy (Reliability)**: Hoàn toàn loại bỏ rủi ro treo tiến trình hoặc chết tiến trình không kiểm soát được nhờ có `ProcessSupervisor` với cơ chế timeout và dọn dẹp cây tiến trình sâu.
- **Tính độc lập (Decoupling)**: 3 Agent CLI hoàn toàn không biết đến sự tồn tại của nhau; mọi giao tiếp đều thông qua hợp đồng dữ liệu chuẩn hóa của Bridge.
- **Tiết kiệm Token & Chi phí**: Ngữ cảnh chuyển giao được nén gọn gàng thông qua `AgentHandoff`, tránh lãng phí chi phí token khi lặp qua nhiều bước.
- **Trải nghiệm lập trình viên (Developer Experience)**: Giao diện dòng lệnh mượt mà, hỗ trợ cả chế độ gõ trực tiếp đa dòng lẫn menu cấu hình model bằng phím mũi tên trực quan.

### 6.2. Đề xuất tính năng cho Milestone 2
1. **Dynamic Tool Injection**: Bổ sung cơ chế cung cấp các công cụ cục bộ tùy chỉnh (như chạy linter đặc thù, query database schema) cho các agent thông qua adapter.
2. **Web Dashboard UI (Localhost)**: Xây dựng một giao diện web cục bộ nhẹ (sử dụng WebSocket) đọc từ thư mục `.orchestrator/` để trực quan hóa sơ đồ DAG và tiến độ chạy thời gian thực.
3. **Git Integration Tự động**: Tự động tạo git branch riêng cho mỗi nhiệm vụ (`feature/task-xxx`), commit code sau khi `OpenCode` hoàn thành và tạo Pull Request tự động khi `Codex` thẩm định thành công.
4. **Hỗ trợ Parallel Verification**: Cho phép gọi đồng thời nhiều verifier độc lập (ví dụ Codex kiểm tra bảo mật + AGY kiểm tra logic kinh doanh) để tăng cường độ tin cậy trước khi chấp thuận.
