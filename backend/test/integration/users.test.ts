import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../../src/db/client.js';
import { users } from '../../src/db/schema/index.js';
import { createUser } from '../../src/db/seed/users.js';
import { verifyPassword } from '../../src/lib/password.js';
import { createTestDb } from '../helpers/test-db.js';

describe('createUser (operator CLI: dist/db/seed/add-user.js)', () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await createTestDb();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('opens a second account next to the admin, as a specialist by default', async () => {
    const result = await createUser(handle.db, { email: ' Ayse@Example.COM ', name: 'Ayşe Yılmaz', password: 'uzun-bir-parola-123' });
    expect(result).toEqual({ created: true, email: 'ayse@example.com', role: 'uzman' });

    const [row] = await handle.db.select().from(users).where(eq(users.email, 'ayse@example.com'));
    expect(row?.role).toBe('uzman');
    expect(await verifyPassword('uzun-bir-parola-123', row?.passwordHash ?? '')).toBe(true);
    expect(row?.passwordHash).not.toContain('uzun-bir-parola-123');
  });

  it('never overwrites an existing account', async () => {
    const again = await createUser(handle.db, { email: 'ayse@example.com', name: 'Başka Biri', password: 'baska-bir-parola-456' });
    expect(again.created).toBe(false);
    const [row] = await handle.db.select().from(users).where(eq(users.email, 'ayse@example.com'));
    expect(row?.name).toBe('Ayşe Yılmaz');
    expect(await verifyPassword('uzun-bir-parola-123', row?.passwordHash ?? '')).toBe(true);
  });

  it('refuses a weak password, a bad e-mail and an unknown role', async () => {
    await expect(createUser(handle.db, { email: 'kisa@example.com', name: 'Kısa', password: 'kisa' })).rejects.toThrow();
    await expect(createUser(handle.db, { email: 'eposta-degil', name: 'Hatalı', password: 'uzun-bir-parola-123' })).rejects.toThrow();
    await expect(
      createUser(handle.db, { email: 'rol@example.com', name: 'Rol', password: 'uzun-bir-parola-123', role: 'root' as 'admin' }),
    ).rejects.toThrow();
    const rows = await handle.db.select({ email: users.email }).from(users);
    expect(rows.map((r) => r.email)).toEqual(['ayse@example.com']);
  });
});
