# استقرار Recall روی سرور شما

مخزن: `mojtabanpe/flashcard`، شاخه: `master`
سرور: `194.48.198.106`، دامنه: `poshtetgarm.ir`
فرض سیستم‌عامل: Linux با معماری x86_64 و Docker Compose V2 یا جدیدتر.

ساخت و آزمون روی GitHub انجام می‌شود. یک ایمیج مستقل به سرور فرستاده می‌شود؛ سرویس `recall-app-1` روی `127.0.0.1:4310` اجرا می‌شود و Nginx موجود درخواست‌های HTTPS را به آن می‌فرستد. کانتینرهای `openmirror-*` و دیتابیس PostgreSQL آن‌ها در این روند مدیریت نمی‌شوند.

## ۱. بررسی اولیه روی سرور

```sh
docker compose version
uname -m
sudo ss -lntp | grep -E ':4310|:20128'
sudo nginx -T | grep -n 'poshtetgarm.ir'
```

پورت 4310 باید آزاد باشد. سرویس تلفظ باید روی همین سرور و آدرس `127.0.0.1:20128` در دسترس باشد. اگر سرویس تلفظ هم کانتینری است، پورت آن را فقط به loopback میزبان منتشر کنید. `localhost` داخل یک کانتینر دیگر به معنای میزبان نیست؛ برای همین کانتینر Recall از شبکهٔ میزبان Linux استفاده می‌کند.

اگر Nginx از قبل برای `poshtetgarm.ir` یک سایت دارد، همان server block را با کانفیگ این پروژه تطبیق دهید؛ سایت تکراری ایجاد نکنید. سایت‌های دامنه‌های دیگر را تغییر ندهید. اگر همین دامنه در حال ارائهٔ OpenMirror است، بهتر است اول دامنهٔ جدا مثل `learn.poshtetgarm.ir` انتخاب کنید و مقدار APP_DOMAIN و server_name و مسیر گواهی را متناسب تغییر دهید.

## ۲. کاربر استقرار و پوشه‌ها

دستورهای زیر یک‌بار و با دسترسی sudo اجرا می‌شوند؛ اگر این کاربر قبلاً وجود دارد، مرحلهٔ ایجاد را رد کنید.

```sh
sudo adduser --uid 11001 --disabled-password --gecos '' recall-deploy
sudo usermod -aG docker recall-deploy
sudo install -d -m 750 -o recall-deploy -g recall-deploy /opt/recall /opt/recall/releases /opt/recall/shared
sudo install -d -m 700 -o 10001 -g 10001 /opt/recall/data /opt/recall/backups
```

عضویت در گروه Docker اختیار مدیریتی روی Docker می‌دهد؛ این حساب فقط برای استقرار استفاده شود. ورود مجدد برای اعمال عضویت گروه لازم است.

روی مک یک کلید اختصاصی برای GitHub بسازید:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/recall-ci -C recall-ci
```

کلید عمومی `~/.ssh/recall-ci.pub` را در فایل `/home/recall-deploy/.ssh/authorized_keys` روی سرور قرار دهید؛ پوشه `.ssh` با دسترسی 700 و فایل با 600 و مالک recall-deploy باشد. کلید خصوصی را فقط در GitHub Secret مرحلهٔ ۵ قرار دهید.

## ۳. تنظیمات خصوصی و انتقال دیتابیس

محتوای `deploy/.env.example` را در `/opt/recall/shared/.env` روی سرور قرار دهید و TTS_API_KEY را با کلید **سرویس تلفظ روی سرور** جایگزین کنید:

```sh
sudo chown recall-deploy:recall-deploy /opt/recall/shared/.env
sudo chmod 600 /opt/recall/shared/.env
```

دامنه در این فایل `poshtetgarm.ir` است و TTS_URL برابر `http://127.0.0.1:20128/v1/audio/speech`. این فایل در Git یا ایمیج Docker قرار نمی‌گیرد. ثبت‌نام عمومی غیرفعال است؛ حساب فعلی شما با انتقال دیتابیس حفظ می‌شود.

قبل از اولین Deploy، روی مک از دیتابیس فعلی یک نسخهٔ سازگار بگیرید:

```sh
pnpm db:backup
```

مسیر فایل خروجی چاپ می‌شود. **همان فایل بکاپ** را بفرستید؛ فایل SQLite زنده را هنگام کار برنامه کپی نکنید:

```sh
scp /ABSOLUTE/PATH/TO/BACKUP.sqlite YOUR_ADMIN_USER@194.48.198.106:/tmp/recall-import.sqlite
```

سپس روی سرور، فقط پیش از اولین اجرای Recall و وقتی `/opt/recall/data/recall.sqlite` هنوز وجود ندارد:

```sh
sudo test ! -e /opt/recall/data/recall.sqlite
sudo install -m 600 -o 10001 -g 10001 /tmp/recall-import.sqlite /opt/recall/data/recall.sqlite
```

اگر دستور test شکست خورد، ادامه ندهید و دیتابیس موجود را بازنویسی نکنید. Deckها، کارت‌ها، رمز حساب و سابقهٔ مرور همراه دیتابیس منتقل می‌شوند. پس از راه‌اندازی، نسخهٔ سرور محل اصلی ثبت مرورها خواهد بود؛ دیتابیس مک و سرور همگام‌سازی خودکار ندارند.

## ۴. DNS، Nginx و HTTPS

در Cloudflare یک رکورد `A` برای `@` با مقدار `194.48.198.106` تنظیم کنید. اگر رکورد AAAA دارید، باید به IPv6 صحیح همین سرور اشاره کند؛ رکورد اشتباه را نگه ندارید. برای گرفتن گواهی اولیه، رکورد را روی DNS only قرار دهید. پورت‌های 80 و 443 باید از اینترنت در دسترس Nginx باشند؛ پورت‌های 4310 و 20128 عمومی نمی‌شوند.

اگر گواهی مناسب از قبل دارید، مسیرهای آن را در `deploy/nginx.conf` استفاده کنید و گرفتن گواهی را رد کنید. در غیر این صورت:

1. `deploy/nginx.bootstrap.conf` را به سایت همین دامنه در Nginx منتقل کنید (در نصب Ubuntu معمولاً sites-available/recall و یک لینک در sites-enabled).
2. پوشهٔ challenge را بسازید و کانفیگ را بررسی کنید:

```sh
sudo mkdir -p /var/www/letsencrypt
sudo nginx -t
sudo systemctl reload nginx
```

3. با Certbot موجود یا نصب‌شده طبق راهنمای رسمی، گواهی بگیرید:

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt -d poshtetgarm.ir
```

4. کانفیگ موقت را با `deploy/nginx.conf` جایگزین و دوباره بررسی و reload کنید. تا اولین استقرار، دریافت 502 طبیعی است:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

5. تمدید گواهی را بررسی کنید: `sudo certbot renew --dry-run`. برای reload گواهی پس از تمدید، یک deploy hook حاوی `nginx -t && systemctl reload nginx` در `/etc/letsencrypt/renewal-hooks/deploy/` قرار دهید. اگر تمدید گواهی از قبل مدیریت می‌شود، روند موجود را حفظ کنید.

پس از صدور گواهی می‌توانید Cloudflare Proxy را روشن کنید؛ حالت SSL/TLS را روی **Full (strict)** بگذارید. Nginx هم در هر استقرار اپ نیاز به تغییر ندارد.

## ۵. GitHub Environment و Secrets

در Settings → Environments یک محیط به نام `production` بسازید و استقرار را به شاخه `master` محدود کنید. Secrets زیر را در آن محیط قرار دهید:

| نام | مقدار |
|---|---|
| DEPLOY_USER | recall-deploy |
| DEPLOY_SSH_KEY | تمام محتوای کلید خصوصی ~/.ssh/recall-ci |
| DEPLOY_KNOWN_HOSTS | خط معتبر کلید SSH برای 194.48.198.106 |

اگر پورت SSH برابر 22 نیست، Variable به نام `DEPLOY_PORT` نیز تنظیم کنید. کلید میزبان را از مسیر مورد اعتماد/کنسول سرور بررسی کنید؛ صرفاً به خروجی تأییدنشدهٔ ssh-keyscan اعتماد نکنید. برای تطبیق، fingerprint سرور را می‌توان با `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` دید.

## ۶. اولین استقرار

همهٔ تغییرات لازم پروژه، به‌ویژه `server/` و `shared/` که اکنون فایل‌های جدید محلی هستند، باید همراه workflow و Dockerfile در Git ثبت و روی master ارسال شوند. `.env`، دیتابیس و بکاپ را ثبت نکنید. ابتدا `git status` و فایل‌های staged را بررسی کنید.

Push روی master، آزمون‌ها و ساخت ایمیج و استقرار را خودکار اجرا می‌کند. برای اجرای دستی: Actions → Test and deploy Recall → Run workflow، شاخه master.

در اولین اجرا فایل تنظیمات، دیتابیس واردشده، Nginx و سرویس تلفظ باید آماده باشند. سپس:

```sh
curl -f https://poshtetgarm.ir/api/health
docker ps --filter name=recall-app-1
```

از گوشی وارد `https://poshtetgarm.ir` شوید، با حساب قبلی وارد شوید و تلفظ را امتحان کنید. افزودن کامل PWA/مرور آفلاین بخشی از این CI/CD نیست.

## بکاپ و بازگشت

قبل از هر استقرار بعدی، از دیتابیس بکاپ online گرفته می‌شود. داده در `/opt/recall/data` و بکاپ‌ها در `/opt/recall/backups` خارج از ایمیج باقی می‌مانند. برای بکاپ مستقل از استقرار، این دستور را به برنامهٔ بکاپ موجود سرور اضافه کنید؛ بکاپی خارج از خود سرور نیز نگه دارید:

```sh
docker exec recall-app-1 node dist/server/src/backup.js /app/backups/manual-YYYYMMDD-HHMMSS.sqlite
```

در شکست health check، ایمیج قبلی خودکار برمی‌گردد. دیتابیس خودکار بازگردانی نمی‌شود تا مرورهای جدید حذف نشوند؛ مهاجرت‌های آینده باید با نسخهٔ قبلی سازگار باشند. برای بازگشت دستی به نسخهٔ قبلیِ موجود:

```sh
cd /opt/recall/releases/PREVIOUS_40_CHARACTER_COMMIT
RELEASE=PREVIOUS_40_CHARACTER_COMMIT docker compose --env-file /opt/recall/shared/.env -f compose.yml up -d app
```

هیچ دستور `docker compose down -v` یا پاک‌سازی سراسری Docker در این روند وجود ندارد. ایمیج‌ها و releaseهای قدیمی فعلاً خودکار پاک نمی‌شوند تا امکان بازگشت حفظ شود.

## راهنماهای رسمی

- GitHub Environments: https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments
- Certbot/Nginx: https://certbot.eff.org/instructions
- Docker Compose: https://docs.docker.com/compose/install/linux/
