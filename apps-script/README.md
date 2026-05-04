# TeamFlow — Apps Script Setup Guide

ทำให้ Sheet **Design Flow** พร้อมใช้งานเป็น backend ของ TeamFlow ภายใน 5 นาที

## ขั้นตอน

### 1. เปิด Apps Script Editor
1. เปิด Spreadsheet **Design Flow**
   <https://docs.google.com/spreadsheets/d/1x--cX8sudjd2ym52XiDSBqEHOaMGHhnayjIr8QnEtiU/edit>
2. เมนู **Extensions → Apps Script**

### 2. วางไฟล์ทั้ง 2 ใน Project
1. ลบโค้ดใน `Code.gs` ทิ้งทั้งหมด
2. เปลี่ยนชื่อไฟล์ `Code.gs` → `Setup.gs` แล้ววางเนื้อหาจาก `Setup.gs`
3. กดปุ่ม `+` ข้างคำว่า "Files" → Script → ตั้งชื่อ `Api`
4. วางเนื้อหาจาก `Api.gs`
5. กด **Save** (💾) หรือ Ctrl+S

### 3. รัน Setup ครั้งเดียว
1. เลือกไฟล์ `Setup.gs`
2. ใน dropdown ด้านบน เลือก function **`setupAll`**
3. กด **Run**
4. ครั้งแรกจะขอ permission → กด **Review permissions** → เลือกบัญชีคุณ → **Allow**
5. รอประมาณ 10 วินาที จะมี popup ✅ Setup Complete

### 4. ตรวจสอบ Tabs
กลับไปดู Spreadsheet ควรจะมี 11 tabs:
- Users, Quotas
- Leaves_UXUI, Leaves_Media, Leaves_Art, Leaves_Management
- Exercises_UXUI, Exercises_Media, Exercises_Art, Exercises_Management
- Audit_Log

### 5. Deploy เป็น Web App (สำหรับเชื่อมกับ HTML)
1. **Deploy → New deployment**
2. คลิก ⚙️ ข้างคำว่า "Select type" → **Web app**
3. กรอก:
   - Description: `TeamFlow API v1`
   - Execute as: **Me (rattikun.k@gmail.com)**
   - Who has access: **Anyone with Google account** (หรือเข้มกว่าถ้ามี Workspace)
4. กด **Deploy** → กด **Authorize access**
5. **Copy** Web app URL ที่ขึ้นมา (ขึ้นต้นด้วย `https://script.google.com/macros/s/.../exec`)

### 6. เอา URL ไปใส่ใน team-manager.js
เปิด `team-manager.js` แก้บรรทัดบนสุด:
```javascript
const API_URL = 'PASTE_YOUR_WEB_APP_URL_HERE';
```

---

## ⚠️ ก่อนใช้งานจริง — ต้องทำ

- [ ] **เปลี่ยน password ของ default users** (`admin123`, `lead123`)
  - เปิด Sheet → Users tab → แก้คอลัมน์ `pass_hash`
  - หรือลบทิ้งแล้วเพิ่มสมาชิกจริงผ่านหน้า app
- [ ] **เพิ่มสมาชิกทีมจริง** ลงใน Users tab
- [ ] **ทดสอบ login** ด้วย account อย่างน้อย 1 คน
- [ ] **ตั้ง Sharing permission** ของ Spreadsheet:
  - **Restricted** หรือเฉพาะคนในทีม (ไม่ควร public)
  - ทีมไม่จำเป็นต้องเข้าถึง Sheet โดยตรง — ทุก action ผ่าน Apps Script

## 🔄 อัปเดต Schema ภายหลัง

ถ้าอยากเพิ่ม column ใหม่ใน tab ไหน:
1. แก้ array `LEAVE_HEADERS` / `EX_HEADERS` / `SCHEMA` ใน `Setup.gs`
2. เพิ่ม column ใน Sheet ด้วยมือ (Apps Script ไม่ลบข้อมูลเก่า)
3. Run `setupAll` ใหม่ — จะข้าม tab ที่มีอยู่แล้ว

## 📦 ไฟล์ใน folder นี้

- `Setup.gs` — ตัวสร้าง tabs + headers + seed users
- `Api.gs` — Web App endpoint (login, leaves, exercises, etc.)
- `README.md` — ไฟล์นี้
