# 📱 HƯỚNG DẪN TEST MOBILE MESSENGER — 49 TÍNH NĂNG

**Ngày cập nhật:** 30/04/2026  
**Branch:** `feature/ui-zalo-density`  
**Trạng thái:** 46/49 done (3 web-only không áp dụng)  
**Người thực hiện:** CEO + Antigravity AI  

---

## 📋 MỤC LỤC

1. [Tổng quan thay đổi](#1-tổng-quan-thay-đổi)
2. [Cách chạy để test](#2-cách-chạy-để-test)
3. [Checklist test 49 tính năng](#3-checklist-test-49-tính-năng)
4. [Chi tiết thao tác test từng nhóm](#4-chi-tiết-thao-tác-test-từng-nhóm)
5. [Lưu ý kỹ thuật](#5-lưu-ý-kỹ-thuật)
6. [Danh sách file đã thay đổi](#6-danh-sách-file-đã-thay-đổi)

---

## 1. TỔNG QUAN THAY ĐỔI

### Những gì đã làm:

| Hạng mục | Chi tiết |
|---|---|
| **UI Refactor** | Giao diện Zalo-density: banner, search row, compact font/spacing |
| **Nhóm Chat** | Đổi tên, thêm/xóa thành viên, đổi avatar nhóm |
| **Media** | Gallery ảnh, danh sách file đính kèm |
| **Tìm kiếm** | Tìm tin nhắn trong conversation + nhảy đến tin nhắn |
| **Profile** | Xem thông tin người dùng khi tap avatar |
| **Reactions** | Xem chi tiết ai đã reaction (long-press) |
| **Push Notifications** | Đăng ký + xin permission (sẵn sàng cho production build) |
| **Font Scaling** | Chống phóng to chữ hệ thống Android |

### Tiến độ tổng:

```
████████████████████████████████████████████░░░░ 92% (45/49)

✅ Done:     45 tính năng
⚪ Web-only:  4 tính năng (không port)
```

---

## 2. CÁCH CHẠY ĐỂ TEST

### Bước 1: Mở terminal tại thư mục project
```bash
cd C:\Projects\baolam-messenger\baolam-messenger-mobile
```

### Bước 2: Chuyển sang branch mới nhất
```bash
git checkout feature/ui-zalo-density
git pull origin feature/ui-zalo-density
```

### Bước 3: Cài dependencies (nếu lần đầu hoặc có package mới)
```bash
yarn install
```

### Bước 4: Chạy Expo dev server
```bash
npx expo start --clear
```

### Bước 5: Quét QR trên điện thoại
- Mở app **Expo Go** trên Android
- Quét QR code hiện trong terminal
- Đợi 30-60 giây để bundle lần đầu

### Lưu ý khi test:
- Điện thoại và máy tính phải **cùng mạng WiFi**
- Nếu bị trắng → lắc điện thoại → chọn **Reload**
- Nếu lỗi port → tắt hết terminal cũ, chạy lại `npx expo start --clear`

---

## 3. CHECKLIST TEST 49 TÍNH NĂNG

> Đánh dấu ✅ khi test pass, ❌ khi test fail, ⏭️ khi skip.

### A. ĐĂNG NHẬP & QUẢN LÝ PHIÊN (4 tính năng)

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 1 | Đăng nhập username/password | Nhập tài khoản → bấm Đăng nhập | ☐ |
| 2 | Đăng xuất | Tab "Cài đặt" → bấm "Đăng xuất" | ☐ |
| 3 | Token refresh tự động | Đợi 30 phút rồi thao tác tiếp → không bị văng | ☐ |
| 4 | Session persistence | Tắt app → mở lại → không phải đăng nhập lại | ☐ |

---

### B. DANH SÁCH HỘI THOẠI (8 tính năng)

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 5 | Hiển thị danh sách conversations | Đăng nhập → thấy danh sách chat | ☐ |
| 6 | Tìm kiếm hội thoại | Gõ tên vào ô "Tìm kiếm hội thoại..." | ☐ |
| 7 | Tìm kiếm người dùng (directory) | Gõ tên người chưa chat → thấy mục "Người dùng" | ☐ |
| 8 | Mở hội thoại trực tiếp (Direct) | Tap người dùng từ kết quả tìm kiếm → mở chat | ☐ |
| 9 | Hiển thị tin nhắn cuối | Mỗi conversation hiện preview + thời gian | ☐ |
| 10 | Unread indicator (chấm đỏ) | Khi có tin mới chưa đọc → chấm đỏ + chữ đậm | ☐ |
| 11 | Avatar ảnh từ server | Conversation có avatar → hiện ảnh, không có → chữ cái | ☐ |
| 12 | Nút tạo hội thoại mới (+) | Bấm nút ⊕ xanh → hiện menu bottom sheet | ☐ |

---

### C. GỬI/NHẬN TIN NHẮN (7 tính năng)

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 13 | Gửi tin nhắn text | Vào chat → gõ chữ → bấm ➤ | ☐ |
| 14 | Nhận tin nhắn real-time | Người khác gửi tin → hiện ngay không cần refresh | ☐ |
| 15 | Upload ảnh | Bấm 📷 → chọn ảnh → gửi | ☐ |
| 16 | Upload file đính kèm | Bấm 📎 → chọn file → gửi | ☐ |
| 17 | Hiển thị ảnh trong tin nhắn | Ảnh hiện thumbnail trong bubble | ☐ |
| 18 | Hiển thị file card | File hiện tên + size trong card | ☐ |
| 19 | Optimistic send | Gửi tin → hiện ngay (○) → chuyển (✓) khi server xác nhận | ☐ |

---

### D. TƯƠNG TÁC TIN NHẮN (7 tính năng)

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 20 | Trả lời tin nhắn (Reply) | Giữ lâu tin nhắn → chọn "↩️ Trả lời" | ☐ |
| 21 | Thu hồi tin nhắn (Recall) | Giữ lâu tin nhắn CỦA MÌNH → chọn "🗑️ Thu hồi" | ☐ |
| 22 | Sao chép tin nhắn (Copy) | Giữ lâu → chọn "📋 Sao chép" → paste thử | ☐ |
| 23 | Chuyển tiếp tin nhắn (Forward) | Giữ lâu → "↪️ Chuyển tiếp" → chọn conversation | ☐ |
| 24 | Ghim tin nhắn (Pin) | Giữ lâu → "📌 Ghim tin nhắn" | ☐ |
| 25 | Emoji Reactions (6 loại) | Giữ lâu → chọn 👍❤️😆😡😭😢 | ☐ |
| 26 | Hiển thị reaction badges | Dưới bubble hiện emoji + số lượng | ☐ |

---

### E. TRẠNG THÁI TIN NHẮN (3 tính năng)

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 27 | Read receipts (đã xem ✓✓) | Gửi tin → người kia đọc → hiện ✓✓ | ☐ |
| 28 | Mark as read khi vào chat | Vào conversation → unread dot biến mất | ☐ |
| 29 | Message status (pending/sent) | Gửi tin → ○ (pending) → ✓ (sent) | ☐ |

---

### F. NHÓM CHAT (5 tính năng) — ⭐ MỚI

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 30 | Tạo nhóm chat mới | Bấm ⊕ → "👥 Tạo nhóm chat" → chọn members → tạo | ☐ |
| 31 | Đổi tên nhóm | Vào group chat → ⚙️ (header) → sửa tên → bấm "Đổi" | ☐ |
| 32 | Thêm thành viên | ⚙️ → bấm "+ Thêm" → tìm người → tap để thêm | ☐ |
| 33 | Xóa thành viên | ⚙️ → bấm 🔴 bên phải tên member → xác nhận | ☐ |
| 34 | Đổi avatar nhóm | ⚙️ → "🖼️ Đổi ảnh đại diện nhóm" → chọn ảnh | ☐ |

> **Lưu ý:** Icon ⚙️ chỉ hiện khi vào **group chat** (không hiện cho chat 1-1)

---

### G. HÌNH ẢNH & MEDIA (5 tính năng + 1 N/A) — ⭐ MỚI

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 35 | Xem ảnh fullscreen | Tap ảnh trong chat → mở fullscreen | ☐ |
| 36 | Zoom ảnh (pinch-to-zoom) | Fullscreen → chụm/mở 2 ngón hoặc tap 2 lần | ☐ |
| 37 | Download file | Tap file card → mở trong browser để tải | ☐ |
| 38 | Gallery ảnh conversation | ⚙️ → "📷 Gallery ảnh" → xem grid ảnh | ☐ |
| 39 | Xem tất cả file đính kèm | ⚙️ → "📁 File đính kèm" → danh sách file | ☐ |
| 40 | Image Editor | ⚪ **N/A** — Web-only (Fabric.js) | ⏭️ |

---

### H. TÌM KIẾM NÂNG CAO (3 tính năng) — ⭐ MỚI

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 41 | Tìm kiếm tin nhắn toàn cục | *(Dùng search bar trên danh sách)* | ☐ |
| 42 | Tìm kiếm trong conversation | Vào chat → 🔍 (header) → gõ từ khóa | ☐ |
| 43 | Nhảy đến tin nhắn (scroll-to) | Từ kết quả tìm kiếm → tap → cuộn đến tin nhắn đó | ☐ |

---

### I. @MENTION & NGƯỜI DÙNG (5 tính năng) — ⭐ MỚI

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 44 | @Mention trong tin nhắn | Gõ @ → hiện dropdown → chọn người | ☐ |
| 45 | Online status | Header chat hiện chấm xanh + "Online" | ☐ |
| 46 | Settings / Cài đặt | Tab "Cài đặt" → thấy profile + nút logout | ☐ |
| 47 | Xem profile người dùng | Trong chat → tap avatar người gửi → popup profile | ☐ |
| 48 | Xem chi tiết reactions | Giữ lâu reaction badge (emoji dưới bubble) → danh sách ai reaction | ☐ |

---

### J. THÔNG BÁO (3 tính năng)

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 49 | Notification sound | Đang trong chat → nhận tin mới → nghe tiếng "ting" | ☐ |
| 50 | Push notifications | ⏳ **Chỉ hoạt động khi build production** (EAS Build) | ⏭️ |
| 51 | Notification permission | ⏳ Tự hỏi khi mở app (production build) | ⏭️ |

---

### K. WEB-ONLY — KHÔNG ÁP DỤNG CHO MOBILE

| # | Tính năng | Lý do |
|---|---|---|
| — | Paste ảnh từ clipboard (Ctrl+V) | Tính năng bàn phím máy tính |
| — | Image Editor (Fabric.js) | Canvas API, không tương thích React Native |
| — | Resize panels (drag separator) | Giao diện desktop |

---

### L. AI SUMMARIZE (1 tính năng) — ⭐ MỚI

| # | Tính năng | Cách test | Kết quả |
|---|---|---|---|
| 49+ | AI Báo cáo tình hình | Vào chat → bấm ✨ (header) → đợi AI → xem báo cáo | ☐ |

---

## 4. CHI TIẾT THAO TÁC TEST TỪNG NHÓM

### 🔵 Test Nhóm Chat (F) — Quan trọng nhất

```
1. Tạo nhóm:
   Màn hình chính → ⊕ → "👥 Tạo nhóm chat"
   → Nhập tên nhóm → Tìm & chọn ít nhất 2 người → "Tạo nhóm"
   → Kiểm tra: nhóm xuất hiện trong danh sách

2. Đổi tên nhóm:
   Vào group chat → Bấm ⚙️ (góc phải header)
   → Sửa ô "Tên nhóm" → Bấm "Đổi"
   → Kiểm tra: header đổi tên, quay lại danh sách cũng đổi

3. Thêm thành viên:
   ⚙️ → Bấm nút "+ Thêm" (xanh)
   → Gõ tên người cần thêm → Tap tên trong kết quả
   → Kiểm tra: alert "Đã thêm..." + member list cập nhật

4. Xóa thành viên:
   ⚙️ → Bấm icon 🔴 bên phải tên member
   → Xác nhận "Xóa" → Kiểm tra: member biến mất khỏi list

5. Đổi avatar nhóm:
   ⚙️ → Bấm "🖼️ Đổi ảnh đại diện nhóm"
   → Chọn ảnh từ thư viện → crop vuông → OK
   → Kiểm tra: alert "Đã cập nhật"
```

### 🔵 Test Gallery & Files (G)

```
1. Gallery ảnh:
   Vào group chat → ⚙️ → "📷 Gallery ảnh"
   → Kiểm tra: grid 3 cột hiện tất cả ảnh trong conversation
   → Tap ảnh → mở fullscreen + zoom

2. File đính kèm:
   ⚙️ → "📁 File đính kèm"
   → Kiểm tra: danh sách file (tên + size)
   → Tap file → mở trong trình duyệt
```

### 🔵 Test Tìm kiếm tin nhắn (H)

```
1. Tìm trong conversation:
   Vào bất kỳ chat → Bấm 🔍 (header)
   → Gõ từ khóa (≥2 ký tự) → Đợi kết quả
   → Tap kết quả → cuộn đến tin nhắn đó

2. Kiểm tra edge cases:
   - Gõ từ khóa không tồn tại → hiện "Không tìm thấy"
   - Gõ 1 ký tự → chưa tìm (cần ≥2)
```

### 🔵 Test Profile & Reactions (I)

```
1. Xem profile:
   Trong chat → Tap vào avatar (hình tròn) của người gửi
   → Popup hiện: Tên, @username, email, phòng ban

2. Chi tiết reactions:
   Giữ lâu vào reaction badge (emoji dưới tin nhắn)
   → Popup hiện: emoji + tên người đã reaction
```

---

## 5. LƯU Ý KỸ THUẬT

### ⚠️ Push Notifications
- **KHÔNG hoạt động** trong Expo Go (đã bị loại từ SDK 53)
- Chỉ test được khi build production: `eas build --platform android`
- Code đã sẵn sàng, chỉ cần config `eas.json` + Firebase

### ⚠️ Font Scaling (Android)
- Đã thêm `maxFontSizeMultiplier={1}` để chống phóng to chữ hệ thống
- Nếu anh/chị thấy chữ vẫn to → vào **Cài đặt Android → Hiển thị → Kích cỡ phông chữ** → đặt về **Mặc định**

### ⚠️ Kết nối mạng
- Điện thoại và máy tính PHẢI cùng mạng WiFi
- Nếu timeout → kiểm tra firewall Windows không block port 8081
- VPN có thể gây lỗi kết nối

### ⚠️ Lỗi màn hình trắng
```
Giải pháp:
1. Lắc điện thoại → Reload
2. Nếu không hết → tắt terminal → chạy lại: npx expo start --clear
3. Nếu vẫn không hết → xóa Expo Go → cài lại từ Play Store
```

---

## 6. DANH SÁCH FILE ĐÃ THAY ĐỔI

| File | Mô tả |
|---|---|
| `app/(tabs)/index.tsx` | Màn hình danh sách chat: UI Zalo-density, banner, search row, bottom sheet, pass `type` param |
| `app/(tabs)/_layout.tsx` | Tab labels: "Tin nhắn" / "Cài đặt" |
| `app/chat/[id].tsx` | Màn hình chat: group settings modal, gallery, file list, msg search, profile, reaction detail |
| `app/_layout.tsx` | Root layout: push notification registration + tap-to-navigate |
| `services/notifications/pushNotifications.ts` | **MỚI** — Push notification service (permission, token, listeners) |
| `services/api/chatApi.ts` | API endpoints (đã có sẵn, không thay đổi) |

### Commits trên branch `feature/ui-zalo-density`:

| Commit | Nội dung |
|---|---|
| `63badbc` | fix: skip push notifications in Expo Go |
| `d8989e8` | fix: downgrade push token error to warn |
| `a890bdc` | feat: push notifications (features 50-51) |
| `173db1b` | feat: gallery, file list, msg search, scroll-to, profile, reactions (features 38-39, 41-43, 47-48) |
| `3287912` | feat: group management - rename, add/remove members, avatar (features 31-34) |
| `47378ee` | fix: maxFontSizeMultiplier per component |
| `fc932df` | feat: Zalo-density specs v5 |
| `a392d91` | feat: banner "BAOLAM Messenger" + search row |

---

## 📊 BẢNG TỔNG HỢP

| Nhóm | Tổng | Done | N/A | Tỷ lệ |
|---|---|---|---|---|
| A. Đăng nhập & Phiên | 4 | 4 | 0 | ✅ 100% |
| B. Danh sách hội thoại | 8 | 8 | 0 | ✅ 100% |
| C. Gửi/Nhận tin nhắn | 7 | 7 | 0 | ✅ 100% |
| D. Tương tác tin nhắn | 7 | 7 | 0 | ✅ 100% |
| E. Trạng thái tin nhắn | 3 | 3 | 0 | ✅ 100% |
| F. Nhóm chat | 5 | 5 | 0 | ✅ 100% |
| G. Hình ảnh & Media | 6 | 5 | 1 | ✅ 83% |
| H. Tìm kiếm nâng cao | 3 | 3 | 0 | ✅ 100% |
| I. @Mention & Người dùng | 5 | 5 | 0 | ✅ 100% |
| J. Thông báo | 3 | 1 | 2* | ⏳ 33%* |
| K. Web-only | 4 | — | 4 | N/A |
| **TỔNG** | **49** | **45** | **4** | **92%** |

> *Push notifications (2 features) chỉ hoạt động khi build production, code đã sẵn sàng.*

---

> **Khi test xong**, vui lòng gửi kết quả checklist (đánh ✅/❌) cho CEO để duyệt merge branch vào `master`.
