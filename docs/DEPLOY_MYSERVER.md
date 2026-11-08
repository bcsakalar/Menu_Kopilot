# Menü Kopilot'u `myserver` üzerine kurmak

Hedef: başka uygulamaları da **nginx** ve **Cloudflare** arkasında sunan mevcut DigitalOcean sunucusu (`ssh myserver`,
Ubuntu, 2 GB RAM + 2 GB swap). Menü Kopilot onların yanında Docker Compose ile çalışır; nginx TLS'i
`*.example.com` için Cloudflare origin sertifikasıyla sonlandırır ve `menu.example.com` adresini
`127.0.0.1:3030` üzerindeki uygulamaya yönlendirir. Aynı sunucuda `qr.example.com` (QR menü) de çalışır.

Sunucuda `github.com/bcsakalar/Menu_Kopilot` reposunun (özel) bir **git kopyası** `/opt/menu-kopilot` içindedir ve
salt-okunur bir deploy anahtarıyla çekilir. Uygulama imajı **bilgisayarda kurulur** (Docker Desktop) ve ssh ile kopyalanır:
diğer uygulamaların yanında `pnpm install` + `tsc` bellek yetmezliğinden ölür. `scripts/deploy.ps1` iki adımı da yapar.

## Sunucuda ne var

| Yol / nesne | Not |
|---|---|
| `/opt/menu-kopilot` | git kopyası (deploy betiği `git pull --ff-only` yapar); compose dosyası `deploy/` içinde |
| `/root/.ssh/menu_kopilot_deploy` + `/root/.ssh/config` içinde `Host github-menu-kopilot` | yalnızca bu repoyu okuyabilen deploy anahtarı (GitHub → Settings → Deploy keys → "myserver (read-only)") |
| `/etc/menu-kopilot/env` (klasör 700, dosya 600) | sırlar; git kopyasının dışında, çekme ya da deploy onlara dokunamaz |
| `menu-kopilot-postgres-1`, `-redis-1`, `-api-1` konteynerleri | uygulama yalnızca `127.0.0.1:3030`; Postgres ve Redis hiçbir porta açık değil |
| `/etc/nginx/sites-available/menu-kopilot.conf` + bağlantı, `/etc/nginx/snippets/mk-proxy.conf` | `deploy/nginx/` kopyaları; ortak `ssl-params.conf` ve `cloudflare-realip.conf` dosyalarını kullanır; limit bölgeleri `mk_` önekli; kayıtlar `mk.*.log` (fail2ban `nginx-limit-req` bunları izler) |
| `/etc/cron.d/menu-kopilot-backup` → `/opt/yedek/menu-kopilot-YYYY-AA-GG.dump` | her gece 03:30, 14 gün saklanır |

Bellek sınırları: Postgres 256 MB, Redis 128 MB, uygulama 384 MB. Ölçülen (2026-11-05): uygulama ~90 MB, Postgres ~35 MB,
Redis ~6 MB.

## 1. DNS (Cloudflare, bir kez)

`A` kaydı **menu** → `<SUNUCU_IP>`, **Proxied**. Bölgenin SSL/TLS modu *Full (strict)*. Kayıt yokken sunucu üzerinde
şöyle denenebilir: `curl -sk --resolve menu.example.com:443:127.0.0.1 https://menu.example.com/health/ready`.

## 2. Sırlar dosyası (bir kez)

Repo kökünde `.env.production` oluştur (git dışında tutulur, asla commit etme):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\new-prod-env.ps1 -AdminEmail <admin e-postası>
```

Betik admin şifresini gizli girişle sorar (en az 12 karakter, yerel şifre olmasın), `POSTGRES_PASSWORD` (hex, çünkü
`DATABASE_URL` içine girer) ve `JWT_SECRET` değerlerini kriptografik rastgeleyle üretir, `GEMINI_API_KEY` / `GROQ_API_KEY`
anahtarlarını yerel `.env` dosyasından ekrana basmadan kopyalar ve LF satır sonlarıyla, BOM'suz yazar. Hiçbir sır ekrana
basılmaz. Var olan dosyanın üzerine `-Force` olmadan yazmaz.

Sunucuya kopyala (deploy betiği her çalışmada CR karakterlerini de temizler ve `chmod 600` uygular):

```powershell
ssh myserver "mkdir -p /etc/menu-kopilot && chmod 700 /etc/menu-kopilot"
scp .env.production myserver:/etc/menu-kopilot/env
ssh myserver "chmod 600 /etc/menu-kopilot/env"
```

Anahtarlar sonradan da eklenebilir: sunucudaki dosyayı düzenle, deploy betiğini yeniden çalıştır. Anahtarsız uygulama
yalnızca veritabanından cevap verir ve bunu söyler.

## 3. Git kopyası (bir kez)

```bash
# sunucuda: yalnızca bu repoyu okuyabilen bir anahtar
ssh-keygen -t ed25519 -N "" -C "myserver menu-kopilot deploy (read-only)" -f /root/.ssh/menu_kopilot_deploy
cat >> /root/.ssh/config <<'EOF'
Host github-menu-kopilot
  HostName github.com
  User git
  IdentityFile /root/.ssh/menu_kopilot_deploy
  IdentitiesOnly yes
EOF
chmod 600 /root/.ssh/config
```

```powershell
# bilgisayarda: açık anahtarı salt-okunur deploy anahtarı olarak kaydet
ssh myserver "cat /root/.ssh/menu_kopilot_deploy.pub" > $env:TEMP\mk_deploy.pub
gh repo deploy-key add $env:TEMP\mk_deploy.pub -R bcsakalar/Menu_Kopilot --title "myserver (read-only)"
ssh myserver "git clone -q git@github-menu-kopilot:bcsakalar/Menu_Kopilot.git /opt/menu-kopilot"
```

## 4. nginx sitesi (bir kez, `deploy/nginx/` her değiştiğinde yeniden)

```bash
cp /opt/menu-kopilot/deploy/nginx/menu-kopilot.conf /etc/nginx/sites-available/
cp /opt/menu-kopilot/deploy/nginx/mk-proxy.conf /etc/nginx/snippets/
ln -sf /etc/nginx/sites-available/menu-kopilot.conf /etc/nginx/sites-enabled/menu-kopilot.conf
nginx -t && systemctl reload nginx
```

Dosyalar kopyalanır, git kopyasına bağlanmaz: bir `git pull` canlı proxy'yi `nginx -t` denenmeden değiştirmemeli.
`nginx -t` yeniden yüklemeden önce çalıştığı için bir hata sunucudaki diğer sitelere ulaşmaz. Kopyalamadan önce eski
dosyaları `/opt/yedek/` altına almak iyi alışkanlıktır. Geri almak için:
`rm /etc/nginx/sites-enabled/menu-kopilot.conf && nginx -t && systemctl reload nginx`.

Site HSTS, `nosniff`, `X-Frame-Options: DENY`, no-referrer ve aynı kaynaklı bir CSP gönderir (yapıştırılan görüntüler
için `blob:`), girişi IP başına dakikada 10, geri kalanı 120 istekle sınırlar ve `/docs` adresini gizler.

## 5. Deploy ve güncelleme

Bilgisayarda Docker Desktop açık olmalı ve commit GitHub'a gönderilmiş olmalı:

```powershell
git push
ssh myserver "/opt/menu-kopilot/deploy/backup.sh"
powershell -File scripts/deploy.ps1
```

Betik `HEAD`'in `origin/main` olduğunu, sırlar dosyasını ve git kopyasını denetler, sunucuda `git pull --ff-only` yapar,
`linux/amd64` için `menu-kopilot-api:<git sha>` imajını kurar, sıkıştırılmış imajı (~100 MB) kopyalar, yığını başlatır ve
`/health/ready` cevabını bekler. Migration'lar ve tohumlama (27 mutfak, şablonlar, admin kullanıcısı) uygulama açılırken
çalışır; panelden düzenlenen ya da silinen şablonların üzerine yazılmaz, geri getirilmez.

## 6. Doğrulama

```powershell
curl.exe -fsS https://menu.example.com/health/ready
ssh myserver "docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}' | grep -E 'NAME|menu-kopilot'"
```

Canlıya karşı uçtan uca kontrol (birkaç analiz başlatır, yapay zekâ çağrısı harcar). Şifre ekrana yansımadan okunur ve
geçmişe yazılmaz:

```powershell
$env:ADMIN_EMAIL = '<admin e-postası>'
$secure = Read-Host 'Admin şifresi' -AsSecureString
$env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
pnpm -C backend live:check --url https://menu.example.com
Remove-Item Env:ADMIN_PASSWORD
```

Cloudflare + nginx üzerinden akış (SSE): sitede bir menü yapıştır; analiz sürerken durum satırı ilerlemeli, sonda
birden belirmemeli (`mk-proxy.conf` içinde `proxy_buffering off`).

## 7. Geri dönüş

```powershell
ssh myserver "docker image ls menu-kopilot-api"                  # sunucuda duran imajlar
powershell -File scripts/deploy.ps1 -SkipBuild -Tag <eski etiket> # kurmadan eski imaja dön
```

Sunucunun gece çalışan `docker system prune -af --filter until=168h` komutu bir haftadır kullanılmayan imajları siler;
geri dönüş imajları yaklaşık 7 gün durur. Uygulama açılırken bekleyen migration'ları uygular. Geri dönüş bir migration'ın
gerisine gidiyorsa önce yeni imaj çalışırken o migration'ı geri al, sonra eski etiketi kur:

```powershell
ssh myserver "cd /opt/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f deploy/docker-compose.prod.yml exec -T api node dist/db/rollback.js"
```

## 8. Yedekler

`/etc/cron.d/menu-kopilot-backup`, [`deploy/backup.sh`](../deploy/backup.sh) betiğini her gece 03:30'da çalıştırır:
`/opt/yedek/menu-kopilot-YYYY-AA-GG.dump` (14 gün), kayıt `/var/log/menu-kopilot-backup.log`.

```bash
/opt/menu-kopilot/deploy/backup.sh                         # hemen bir yedek
docker exec -i menu-kopilot-postgres-1 sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  < /opt/yedek/menu-kopilot-YYYY-AA-GG.dump                # geri yükleme
```

Ara sıra bir yedeği sunucudan dışarı al (`scp myserver:/opt/yedek/menu-kopilot-*.dump .`): sunucu tek disktir.

## 9. Tamamen kaldırma

```bash
cd /opt/menu-kopilot && docker compose --env-file /etc/menu-kopilot/env -f deploy/docker-compose.prod.yml down -v  # verileri siler
rm /etc/nginx/sites-enabled/menu-kopilot.conf /etc/nginx/sites-available/menu-kopilot.conf /etc/nginx/snippets/mk-proxy.conf
nginx -t && systemctl reload nginx
rm -r /opt/menu-kopilot /etc/menu-kopilot /etc/cron.d/menu-kopilot-backup
```

Yeniden başlamayı denemek için sunucuyu yeniden başlatma: başka canlı uygulamalar da orada çalışır. `restart:
unless-stopped`, Docker servisi ya da makine yeniden başladığında konteynerleri geri getirir.

Not: Menü Kopilot 2026-09-18'de sunucudaki `old-app` uygulamasının yerini aldı; o uygulama silinmedi, durdurulup
`/opt/arsiv/old-app-20260918-2325` altına arşivlendi.
