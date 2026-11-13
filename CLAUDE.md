# Menü Kopilot: kod asistanları için kurallar

Önce `README.md` (mimari, neyi nerede değiştireceğin) ve `PROGRESS.md` (güncel durum) okunur.

- **Kontroller:** her değişiklikten sonra `cd backend; pnpm lint; pnpm typecheck; pnpm test` ve `cd web; pnpm test; pnpm build`.
  Testler Docker ve API anahtarı istemez.
- **Prompt değişince** `backend/src/agents/prompts/index.ts` içindeki `AGENT_PROMPT_VERSIONS` numarası artırılır; yoksa canlıya
  yansımaz.
- **Migration'lar elle yazılır:** ileri (`backend/drizzle/000N_*.sql`), geri (`backend/drizzle/down/`), `meta/_journal.json`
  kaydı ve `test/integration/migrations.test.ts` güncellemesi birlikte.
- **Anahtarlar yalnızca sunucuda.** `web/` altına sağlayıcı anahtarı ya da adresi yazılmaz; `.env*` commit edilmez.
- **Ziyaretçi ortak veriye yazamaz.** Yeni bir uç `backend/src/app.ts` içinde doğru kapsama (açık / oturum / admin) bağlanır.
- **Dil:** arayüz metinleri Türkçe; kod, kod yorumları ve commit mesajları İngilizce, `feat(web): …` biçiminde.
- **Kararlar** `DECISIONS.md` sonuna `D-210`'dan devam ederek eklenir.
- **Canlıya alma** (`scripts/deploy.ps1`, `ssh myserver`) proje sahibinin açık onayı olmadan yapılmaz.
