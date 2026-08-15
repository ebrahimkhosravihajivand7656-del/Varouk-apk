# Varouk Platform V1
نسخه یکپارچه Backend + PostgreSQL + پنل مدیریت واروک.

این نسخه برای Deploy روی Render آماده شده است.

## ساختار
- `server.js` : API + دیتابیس + احراز هویت + پنل
- `db/schema.sql` : ساخت جداول PostgreSQL
- `public/admin/` : پنل مدیریت
- `render.yaml` : تنظیمات سرویس Render

## Render
1. یک PostgreSQL Database بسازید.
2. یک Web Service از همین پروژه بسازید.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variables:
   - DATABASE_URL = Internal Database URL
   - JWT_SECRET = یک مقدار تصادفی طولانی
   - ADMIN_USER = شماره/شناسه مدیر
   - ADMIN_PASSWORD = رمز قوی
   - CORS_ORIGIN = *

بعد از Deploy:
`https://YOUR-SERVICE.onrender.com/admin`

## ورود
مقادیر ADMIN_USER و ADMIN_PASSWORD همان اطلاعات ورود پنل هستند.

این نسخه هنوز هیچ محصول واقعی Seed نمی‌کند.

### نکته ورود مدیر
در هر Deploy، مقادیر `ADMIN_USER` و `ADMIN_PASSWORD` از Environment خوانده می‌شوند و حساب مدیر با همان اطلاعات به‌روزرسانی می‌شود.
