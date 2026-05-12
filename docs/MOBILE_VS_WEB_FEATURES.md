# 📱 MOBILE MESSENGER — TỔNG HỢP & SO SÁNH VỚI WEB

**Ngày lập:** 09/05/2026  
**Nguồn:** Mã nguồn `baolam-messenger-mobile` (Expo / React Native), đối chiếu `baolam-messenger-fe/docs/WEB_CHAT_FEATURES_CATALOG.md`.  
**Mục đích:** Một tài liệu riêng (không gộp vào catalog web) để nắm **mobile có gì**, **web có gì mobile chưa có**, và **nên port cái gì lên web** (mức độ ưu tiên / hợp lý).

---

## 1. TỔNG QUAN KIẾN TRÚC MOBILE

| Thành phần | Ghi chú |
|------------|---------|
| **App** | Expo Router: màn chính `app/(tabs)/index.tsx` (danh sách + đăng nhập), chat `app/chat/[id].tsx`, trợ lý AI `app/ai-assistant.tsx`, cài đặt `app/(tabs)/explore.tsx` (đặt tên file explore nhưng UI là **Cài đặt**). |
| **API** | Dùng chung backend với web; `services/api/chatApi.ts` gần tương đương web nhưng **thiếu một nhóm endpoint** xem mục 4. |
| **Realtime** | `services/realtime/reverbClient.ts` — cùng mô hình Reverb/Echo như web. |
| **Thông báo** | Push (Expo Notifications) — **chổi rõ trong guide**: không chạy đúng trong Expo Go, cần bản production; code đăng ký token + unregister khi logout. |

---

## 2. NHÓM TÍNH NĂNG MOBILE (TỔNG HỢP)

Tài liệu test chi tiết và checklist: **`MOBILE_FEATURE_TEST_GUIDE.md`** (49 mục + AI báo cáo). Phần dưới **cộng thêm** những gì có trong code nhưng guide chưa nêu hết hoặc cần làm rõ.

### A. Đăng nhập & phiên

- Đăng nhập username/password ngay trên tab Tin nhắn khi chưa có token (`index.tsx`).
- Token lưu `authStorage`; gọi `auth/me` khi mở app; refresh / hết hạn xử lý qua http client (theo pattern dự án).
- **Không thấy** màn SSO (`/sso-login` kiểu web) trong flow mobile hiện tại.

### B. Danh sách hội thoại & tìm kiếm

- Danh sách conversation, kéo refresh, polling khi realtime kém.
- **Tìm kiếm:** debounce → `searchChatDirectory` + **`searchGlobal`** (`/chat/search`) — hiển thị user, nhóm, tin nhắn; chọn để mở chat / nhảy tin (theo implementation `index.tsx`).
- UI **Zalo-density**: banner, search row, bottom sheet **⊕** (tạo nhóm / hành động mới).
- **AiAssistantHomeCard:** thẻ “Trợ lý của bạn” + badge số task pending → điều hướng `/ai-assistant`.

### C. Chat (`app/chat/[id].tsx`)

- Gửi/nhận text, ảnh, file; optimistic + trạng thái gửi; realtime.
- **Reply** (lệ thuộc UI), **forward** (modal chọn hội thoại), **thu hồi** (tin của mình), **sao chép** nội dung tin (Clipboard).
- **@mention** + **`@everyone`** (cùng constant với web).
- **Reaction** 6 loại + **long-press badge** xem chi tiết (gọi API reactions).
- **Read receipts:** hiển thị **✓ / ✓✓** theo `read_by` (không có modal danh sách đọc đầy đủ như web).
- **Ghim:** long-press → gọi API pin; **chưa có** UI “bảng ghim / bỏ ghim / Group board” như web (xem mục 4).
- **Tìm trong conversation** (header 🔍), **nhảy tới tin** qua `messages/around` khi cần.
- **Nhóm:** modal cài đặt — đổi tên, đổi avatar, thêm/xóa thành viên (theo guide F).
- **Gallery ảnh + danh sách file** từ cài đặt nhóm / header (theo guide G).
- **Task:** icon checklist mở **TaskChecklistModal**; long-press tin → **Task nhanh** + **ManualCreateTaskModal**; API `create-quick`, `create-manual`, `suggestTask`, `transition`, `complete`, v.v. (đồng bộ với web).
- **AI:** nút ✨ — `POST /ai/summarize` với **khoảng cố định 7 ngày** và câu hỏi cố định (không có modal cấu hình phạm vi / mục tiêu như web).

### D. Trợ lý AI toàn cục (`AiAssistantScreen.tsx` + route)

- Danh sách task (filter assigned / created / overdue), infinite scroll, jump to message, evidence guard, complete / AI confirm-reject (gọi API như `chatApi` mobile), tương đương chức năng chính của **AiAssistantChatPane** bên web.

### E. Cài đặt (`explore.tsx`)

- Profile card, **Dark/Light theme** (`ThemeContext`), switch thông báo (local preference), **đăng xuất** (đóng Reverb, unregister push, `auth/logout`, xóa token).

### F. Đặc thù native (không áp dụng web)

- **Push notifications** production, tap notification → vào đúng chat (`_layout` + push service).
- **Zoom ảnh** pinch/fullscreen cử chỉ tay.
- **maxFontSizeMultiplier** — giảm vỡ layout khi user phóng chữ Android.
- **Haptic tab** và các component Expo mẫu.

---

## 3. BẢNG PARITY NHANH: MOBILE ↔ WEB

| Hạng mục | Mobile | Web |
|----------|--------|-----|
| Đăng nhập password | ✅ | ✅ |
| SSO | ❌ (chưa thấy màn/route) | ✅ |
| Privacy policy route | ❌ | ✅ `/privacy-policy` |
| Embed ERP + resize cửa sổ | N/A | ✅ `postMessage` |
| Directory + global search | ✅ | ✅ |
| Tạo nhóm | ✅ | ✅ |
| Nhóm trùng tên (409) | ⚠️ Chỉ `Alert` lỗi chung | ✅ DuplicateGroupModal |
| Xóa nhóm + `delete-info` | ❌ không thấy flow | ✅ DeleteGroupModal |
| Cloud conversation (`/conversations/cloud`) | ❌ không có trong `chatApi` mobile | ✅ |
| Reaction + chi tiết | ✅ Long-press badge | ✅ Popover/modal |
| Read receipts ✓✓ | ✅ Inline | ✅ + modal facepile đầy đủ |
| Pin tin | ✅ API | ✅ + banner + Group board |
| Bỏ ghim / Board “ghi chú” | ❌ / tối thiểu | ✅ |
| Copy nội dung tin | ✅ | ❌ (chưa có nút — user copy thủ công) |
| Draft theo từng hội thoại | ❌ store tối giản | ✅ `chatUiStore` đầy đủ |
| Kéo-thả / dán clipboard file | ❌ | ✅ |
| Editor ảnh Fabric | ❌ (RN) | ✅ |
| My Cloud (`/my-files`) | ❌ không có trong `chatApi` | ✅ panel |
| Chấm công MISA header DM | ⚠️ **Chấm xanh “Online” + chữ cứng** — không gọi attendance API trong `[id].tsx` | ✅ badge thật từ API |
| AI summarize | ✅ 7 ngày cố định | ✅ + **AiSettings** (range, file, objective) + Situation modal |
| Demo summarize / báo cáo CEO | ❌ không thấy | ✅ |
| Force scan AI (nút sidebar) | ❌ | ✅ |
| Trợ lý task | ✅ Tab + `/ai-assistant` + checklist trong chat | ✅ Pane + widget |

---

## 4. WEB ĐANG CÓ — MOBILE CHƯA THẤY TRONG CODE (GAP)

Các endpoint / màn chỉ có ở **web catalog** hoặc `chatApi.ts` web, **không** xuất hiện trong `baolam-messenger-mobile/services/api/chatApi.ts` đến cuối file:

- **`openCloudConversation`** (`POST /conversations/cloud`).
- **Toàn bộ Personal Cloud**: `GET/POST /my-files`, presign, URL, delete.
- **Attendance MISA**: `attendance-today`, summary, mapping, `employee-id` (mobile header “Online” **không** dùng các API này).
- **CEO realtime dashboard**.
- **`getConversationDeleteInfo`** + luồng xóa nhóm có kiểm soát như web.
- (Web còn nhiều tiện ích layout: resize panel, image editor — bản chất không cần lên mobile.)

---

## 5. MOBILE ĐANG CÓ — WEB NÊN XEM XÉT TIẾP THU

| Tính năng mobile | Đề xuất cho web | Mức độ / ghi chú |
|------------------|-----------------|-------------------|
| **Sao chép tin nhắn** một chạm | Nên có | **Cao.** Chi phí nhỏ, PM/CEO hay cần dán vào email/tài liệu. Thêm vào menu message (…) |
| **Thẻ AI trên home** đã có sẵn trên mobile (card + badge) | Web đã có **ERPAssistantWidget** tương đương | Đối chiếu copy & vị trí — coi là **đã parity**. |
| **Dark/Light** theo người dùng | Tùy chọn | **Trung bình.** Web đang theme tối cố định; chỉ làm nếu có yêu cầu trải nghiệm/phục trợ hình. |
| **Push-native** không áp dụng | Không port | Giữ Web Push / browser như catalog. |

---

## 6. ƯU TIÊN ĐỀ XUẤT (CHO SẾP / PM)

### Nên làm trên Web (ROI cao, thiếu rõ so với mobile)

1. **Copy tin nhắn** trong menu bubble (parity với long-press mobile).  
2. **Làm rõ / thay “Online” giả** trên mobile bằng **MISA thật** hoặc bỏ chữ misleading — đây là **parity + độ tin cậy**, không phải mang từ mobile lên web mà là **chuẩn hóa cả hai** theo API web.

### Nên làm trên Mobile (parity với Web / giá trị nghiệp vụ)

1. **Cloud cá nhân** + **`openCloud`** nếu nghiệp vụ đang dùng trên ERP web.  
2. **Luồng xóa nhóm** + `delete-info` (đếm tin, task pending) giống web — tránh xóa nhầm.  
3. **Modal khi trùng tên nhóm (409)** thay Alert chung — giống web.  
4. **UI danh sách ghim + bỏ ghim + “bảng tin nhóm”** — đồng bộ tri thức với web.  
5. **Read receipts chi tiết** (danh sách người đã đọc) — API đã có, chỉ cần modal giống web.  
6. **AI báo cáo nâng cao:** tái sử dụng tham số như web (phạm vi, có/không file, objective) hoặc tối thiểu thêm preset “Hôm nay / 24h” để không chỉ cứng 7 ngày.

### Không nhất thiết port sang Web

- Pinch zoom native (đủ fullscreen + zoom nhẹ là được).  
- Push notification semantics giữ native.  
- Haptic.

### Không nhất thiết port sang Mobile

- Image Editor Fabric.js.  
- Resize panel đa cột desktop.  
- Paste ảnh từ Ctrl+V của desktop (đã có picker/camera).

---

## 7. LIÊN KẾT TÀI LIỆU LIÊN QUAN

- **Checklist test mobile:** [`MOBILE_FEATURE_TEST_GUIDE.md`](./MOBILE_FEATURE_TEST_GUIDE.md)  
- **Danh mục tính năng web:** [`../../baolam-messenger-fe/docs/WEB_CHAT_FEATURES_CATALOG.md`](../../baolam-messenger-fe/docs/WEB_CHAT_FEATURES_CATALOG.md)  

---

*Tài liệu được viết sau khi đọc `app/(tabs)/index.tsx`, `app/chat/[id].tsx`, `widgets/chat/AiAssistantScreen.tsx`, `TaskChecklistModal.tsx`, `services/api/chatApi.ts`, `AiAssistantHomeCard.tsx`, và đối chiếu catalog web.*
