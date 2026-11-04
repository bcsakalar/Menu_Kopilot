import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { devices, users } from '../../db/schema/index.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { AccessTokenClaims, AuthUser, TokenResponse, UserDto } from './schemas.js';

export interface AuthServiceOptions {
  accessTtlSeconds: number;
  signAccessToken: (claims: AccessTokenClaims, expiresInSeconds?: number) => string;
  now?: () => Date;
}

/** A browser keeps its conversations for a year; it renews nothing, so a cleared cookie just starts a new visitor. */
export const VISITOR_SESSION_SECONDS = 365 * 86_400;
/** `verifyPassword` refuses anything that is not a scrypt hash: a visitor row can never be logged in to. */
const NO_PASSWORD = '!';

type UserRow = typeof users.$inferSelect;

function toDto(user: UserRow): UserDto {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export class AuthService {
  private readonly now: () => Date;
  /** Hash used when the email is unknown so both branches cost one scrypt verification. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly db: Database,
    private readonly options: AuthServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  private claims(user: UserRow, deviceId: string): AccessTokenClaims {
    return { sub: user.id, role: user.role, tv: user.tokenVersion, did: deviceId };
  }

  async login(email: string, password: string, deviceName: string): Promise<TokenResponse> {
    const [user] = await this.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user) {
      this.dummyHash ??= hashPassword('timing-equalizer');
      await verifyPassword(password, await this.dummyHash);
      throw new AppError('UNAUTHORIZED', 'E-posta veya şifre hatalı');
    }
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppError('UNAUTHORIZED', 'E-posta veya şifre hatalı');
    }
    const deviceId = await this.openDevice(user.id, deviceName);
    return {
      accessToken: this.options.signAccessToken(this.claims(user, deviceId)),
      expiresIn: this.options.accessTtlSeconds,
      deviceId,
      user: toDto(user),
    };
  }

  /**
   * The site has no sign-in (D-200): a browser's first message creates a user of its own, so every existing ownership
   * check, quota and history keeps working per visitor, and the cookie is all that identifies it.
   */
  async createVisitor(): Promise<{ token: string; user: AuthUser }> {
    const id = randomUUID();
    const [user] = await this.db
      .insert(users)
      .values({ id, email: `${id}@visitor.invalid`, name: 'Ziyaretçi', role: 'uzman', passwordHash: NO_PASSWORD })
      .returning();
    if (!user) throw new AppError('INTERNAL_ERROR', 'Oturum oluşturulamadı');
    const deviceId = await this.openDevice(user.id, 'Web');
    return {
      token: this.options.signAccessToken(this.claims(user, deviceId), VISITOR_SESSION_SECONDS),
      user: { ...toDto(user), deviceId },
    };
  }

  private async openDevice(userId: string, deviceName: string): Promise<string> {
    const [device] = await this.db.insert(devices).values({ userId, deviceName, lastSeen: this.now() }).returning({ id: devices.id });
    if (!device) throw new AppError('INTERNAL_ERROR', 'Oturum oluşturulamadı');
    return device.id;
  }

  async logout(deviceId: string): Promise<void> {
    await this.db.update(devices).set({ revokedAt: this.now() }).where(eq(devices.id, deviceId));
  }

  /** Called on every authenticated request: the token must match the user's token_version and a live session. */
  async validateAccess(claims: AccessTokenClaims): Promise<AuthUser | undefined> {
    const [row] = await this.db
      .select({ user: users, device: devices })
      .from(users)
      .innerJoin(devices, eq(devices.userId, users.id))
      .where(and(eq(users.id, claims.sub), eq(devices.id, claims.did)))
      .limit(1);
    if (!row || row.user.tokenVersion !== claims.tv || row.device.revokedAt !== null) return undefined;
    return { ...toDto(row.user), deviceId: row.device.id };
  }
}
