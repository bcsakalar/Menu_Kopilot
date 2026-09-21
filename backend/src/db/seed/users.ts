import { z } from 'zod';
import { hashPassword } from '../../lib/password.js';
import type { Database } from '../client.js';
import { users } from '../schema/index.js';

/**
 * Accounts beyond the admin the seed creates. There is no sign-up in the app on purpose: an account is opened by the
 * operator on the server (`node dist/db/seed/add-user.js`), with a password read from stdin.
 */

export const newUserSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(2).max(80),
  /** `uzman` can do everything except versioning prompts; `admin` can do that too. */
  role: z.enum(['admin', 'uzman']).default('uzman'),
  password: z.string().min(12, 'Parola en az 12 karakter olmalı').max(200),
});
export type NewUser = z.input<typeof newUserSchema>;

/** Creates the account; an e-mail that already has one is left untouched (`created: false`). */
export async function createUser(db: Database, input: NewUser): Promise<{ created: boolean; email: string; role: string }> {
  const user = newUserSchema.parse(input);
  const inserted = await db
    .insert(users)
    .values({ email: user.email, name: user.name, role: user.role, passwordHash: await hashPassword(user.password) })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  return { created: inserted.length > 0, email: user.email, role: user.role };
}
