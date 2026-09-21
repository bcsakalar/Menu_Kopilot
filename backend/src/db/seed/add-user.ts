/**
 * Opens an account. The password comes from stdin (first line), never from the command line, so it stays out of the
 * shell history and the process list.
 *
 *   echo '<password>' | pnpm user:add --email ayse@example.com --name "Ayşe Yılmaz" [--role uzman|admin]
 *   ssh myserver "docker exec -i menu-kopilot-api-1 node dist/db/seed/add-user.js --email … --name …" < password.txt
 */
import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { loadConfig } from '../../config/env.js';
import { createPostgresDb } from '../client.js';
import { createUser, type NewUser } from './users.js';

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'uzman' },
  },
});

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) throw new Error('Parolayı stdin üzerinden ver (ör. dosyadan yönlendir); komut satırına yazma.');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  return (Buffer.concat(chunks).toString('utf8').split(/\r?\n/u)[0] ?? '').trim();
}

const config = loadConfig();
const handle = createPostgresDb(config.databaseUrl, { max: 1 });
try {
  const result = await createUser(handle.db, {
    email: args.email ?? '',
    name: args.name ?? '',
    // Checked by the schema: anything but admin/uzman is refused, not silently mapped.
    role: args.role as NewUser['role'],
    password: await readPassword(),
  });
  console.log(result.created ? `Hesap açıldı: ${result.email} (${result.role})` : `Bu e-posta zaten kayıtlı, dokunulmadı: ${result.email}`);
} catch (err) {
  console.error(err instanceof ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n') : err);
  process.exitCode = 1;
} finally {
  await handle.close();
}
