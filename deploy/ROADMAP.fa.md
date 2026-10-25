# رودمپ استقرار — تغییر رمز، ایمیل و متن‌های AI

وضعیت تا ۲۰۲۶-۱۰-۲۵. این فایل کارهای باقی‌مانده را به ترتیب اجرا فهرست می‌کند تا از لپ‌تاپی که دسترسی SSH به سرور دارد (alias `flashcard`) انجام شود. هیچ کلید یا رمزی در این فایل نیست.

## انجام‌شده

- [x] تغییر رمز در صفحهٔ Account، فراموشی رمز با لینک ایمیلی یک‌بارمصرف (یک ساعت)، ایمیل اطلاع‌رسانی تغییر رمز.
- [x] ساخت متن ریدینگ با AI: ۲۰ موضوع، سطح B1/B2/C1، حدود ۱۰۰۰ کلمه (≈ ۱۵ دقیقه).
- [x] هدر موبایل در یک خط (آیکون حساب و خروج).
- [x] همه روی `master`؛ آخرین کامیت کد: `1046a26d15defb11f184d11426a30e9e10298eba`. تست‌ها و ساخت ایمیج در GitHub Actions موفق بودند.
- [x] دامنهٔ `poshtetgarm.ir` در Resend تأیید شد؛ رکوردهای DKIM (`resend._domainkey`)، `send` و `rsend` در Cloudflare هستند.
- [x] رکورد DMARC: `_dmarc.poshtetgarm.ir TXT "v=DMARC1; p=none;"`.

## مسدودکننده

- [ ] **استقرار خودکار کار نمی‌کند.** مرحلهٔ deploy در GitHub Actions با این خطا شکست می‌خورد:
  `ssh: connect to host 194.48.198.106 port 22: Connection timed out`.
  GitHub به پورت SSH سرور نمی‌رسد. تا رفع آن (مرحلهٔ ۶)، استقرار دستی است.

## ۱. گرفتن بستهٔ release

بستهٔ ساخته‌شده در GitHub تا **۲۰۲۶-۱۱-۰۱** نگه داشته می‌شود.

```sh
R=1046a26d15defb11f184d11426a30e9e10298eba
mkdir -p ~/recall-release && cd ~/recall-release
gh run download 40203664938 -R mojtabanpe/flashcard -n recall-release
ls -lh release.tar.gz
```

بدون `gh`: از [صفحهٔ اجرا](https://github.com/mojtabanpe/flashcard/actions/runs/40203664938) بخش Artifacts فایل `recall-release` را دانلود و unzip کنید.

اگر منقضی شده بود: Actions → Test and deploy Recall → Run workflow روی `master`. مرحلهٔ deploy باز شکست می‌خورد ولی artifact تازه ساخته می‌شود؛ `R` را برابر SHA همان اجرا بگذارید.

## ۲. استقرار روی سرور

`release.sh` قبل از جایگزینی از Postgres بکاپ می‌گیرد، جدول تازهٔ `password_resets` هنگام بالا آمدن برنامه خودکار ساخته می‌شود، و اگر health check رد شود ایمیج قبلی برمی‌گردد.

```sh
ssh flashcard "mkdir -p /opt/recall/releases/$R"
scp release.tar.gz flashcard:/opt/recall/releases/$R/
ssh flashcard "cd /opt/recall/releases/$R && tar -xzf release.tar.gz && bash release.sh $R"
```

اگر کاربر `flashcard` عضو گروه docker نیست، دستور آخر را با `sudo -u recall-deploy` اجرا کنید.

بررسی:

```sh
ssh flashcard 'cat /opt/recall/shared/current-release; docker inspect --format "{{.State.Health.Status}}" recall-app-1'
curl -f https://poshtetgarm.ir/api/health
```

## ۳. فعال‌سازی ایمیل (Resend)

اول بررسی کنید سرور به SMTP ریسند می‌رسد:

```sh
ssh flashcard 'nc -vz -w 10 smtp.resend.com 465'
```

اگر نرسید، پورت 587 را امتحان کنید و در `SMTP_URL` به جای `smtps://…:465` از `smtp://…:587` استفاده کنید.

سه خط زیر را به `/opt/recall/shared/.env` اضافه کنید (`RESEND_KEY` = کلید Sending access ریسند؛ این فایل در Git نیست):

```
SMTP_URL=smtps://resend:RESEND_KEY@smtp.resend.com:465
MAIL_FROM=Recall <no-reply@poshtetgarm.ir>
APP_PUBLIC_URL=https://poshtetgarm.ir
```

`.env` فقط هنگام ساخت کانتینر خوانده می‌شود؛ `docker restart` کافی نیست:

```sh
ssh flashcard 'r=$(cat /opt/recall/shared/current-release); cd /opt/recall/releases/$r && RELEASE=$r docker compose --env-file /opt/recall/shared/.env -f compose.yml up -d --no-deps app'
```

## ۴. Nginx برای درخواست‌های AI

ساخت متن ۱۰۰۰ کلمه‌ای ممکن است بیش از ۶۰ ثانیه طول بکشد. بلوک `location /api/ai/` (با `proxy_read_timeout 150s`) را از `deploy/nginx.conf` به server block سایت `poshtetgarm.ir` (پورت 443) در Nginx سرور اضافه کنید. سپس:

```sh
ssh flashcard 'sudo nginx -t && sudo systemctl reload nginx'
```

## ۵. آزمون روی سایت

- [ ] ورود، سپس صفحهٔ Account → تغییر رمز؛ ایمیل «Your Recall password was changed» برسد و دستگاه‌های دیگر خارج شوند.
- [ ] خروج → «Forgot password?» با ایمیل خودتان؛ لینک برسد (Spam را هم ببینید)، رمز تازه ثبت شود و ورود با آن کار کند.
- [ ] Reading → Add text → یک موضوع و سطح → Generate؛ متن حدوداً ۱۰۰۰ کلمه‌ای بیاید و «Save and read» کار کند.
- [ ] هدر در گوشی یک خط باشد.
- [ ] در صورت خطا: `ssh flashcard 'docker logs --tail 100 recall-app-1'`.

## ۶. رفع استقرار خودکار

یکی از این دو:

- **باز کردن SSH برای GitHub:** پورت 22 سرور برای رنج IPهای GitHub Actions (از `https://api.github.com/meta`، کلید `actions`) باز شود. اگر سرور فقط از داخل ایران در دسترس است، این راه عملی نیست.
- **Self-hosted runner روی سرور (پیشنهادی):** runner خود سرور به GitHub وصل می‌شود و پورت ورودی لازم ندارد. job مرحلهٔ deploy در `.github/workflows/ci-cd.yml` به `runs-on: [self-hosted, recall]` تغییر می‌کند و به جای SSH مستقیم `release.sh` را اجرا می‌کند. runner با کاربر `recall-deploy` اجرا شود، نه root.

## ۷. امنیت

- [ ] توکن API کلادفلر که در گفتگو فرستاده شد را در Cloudflare → My Profile → API Tokens حذف کنید.
- [ ] در Resend یک کلید جدید از نوع Sending access محدود به `poshtetgarm.ir` بسازید، در `.env` بگذارید (مرحلهٔ ۳)، و کلید قبلی را حذف کنید.
- [ ] بعد از چند هفته اگر گزارش‌های DMARC مشکلی نشان ندادند، می‌توان `p=none` را به `p=quarantine` تغییر داد.

## بعد از استقرار

- [ ] `deploy/server-status.md` را با release جدید و نتیجهٔ آزمون‌ها به‌روز کنید.
- [ ] این فایل را با وضعیت جدید به‌روز یا بایگانی کنید.
