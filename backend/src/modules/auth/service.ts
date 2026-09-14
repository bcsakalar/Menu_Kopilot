import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { devices, users } from '../../db/schema/index.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { AccessTokenClaims, AuthUser, TokenResponse, UserDto } from './schemas.js';

export interface AuthServiceOptions {
  refreshTtlDays: number;
  accessTtlSeconds: number;
  signAccessToken: (claims: AccessTokenClaims) => string;
  now?: () => Date;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

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

  private refreshExpiry(): Date {
    return new Date(this.now().getTime() + this.options.refreshTtlDays * 86_400_000);
  }

  private issue(user: UserRow, deviceId: string, refreshToken: string): TokenResponse {
    const accessToken = this.options.signAccessToken({
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion,
      did: deviceId,
    });
    return { accessToken, refreshToken, expiresIn: this.options.accessTtlSeconds, deviceId, user: toDto(user) };
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
    const refreshToken = randomBytes(32).toString('base64url');
    const [device] = await this.db
      .insert(devices)
      .values({
        userId: user.id,
        deviceName,
        refreshTokenHash: sha256(refreshToken),
        refreshExpiresAt: this.refreshExpiry(),
        lastSeen: this.now(),
      })
      .returning({ id: devices.id });
    if (!device) throw new AppError('INTERNAL_ERROR', 'Cihaz kaydı oluşturulamadı');
    return this.issue(user, device.id, refreshToken);
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    const [row] = await this.db
      .select({ device: devices, user: users })
      .from(devices)
      .innerJoin(users, eq(devices.userId, users.id))
      .where(
        and(
          eq(devices.refreshTokenHash, sha256(refreshToken)),
          isNull(devices.revokedAt),
          gt(devices.refreshExpiresAt, this.now()),
        ),
      )
      .limit(1);
    if (!row) throw new AppError('UNAUTHORIZED', 'Oturum süresi doldu, tekrar giriş yap');
    const rotated = randomBytes(32).toString('base64url');
    await this.db
      .update(devices)
      .set({ refreshTokenHash: sha256(rotated), refreshExpiresAt: this.refreshExpiry(), lastSeen: this.now() })
      .where(eq(devices.id, row.device.id));
    return this.issue(row.user, row.device.id, rotated);
  }

  async logout(deviceId: string): Promise<void> {
    await this.db
      .update(devices)
      .set({ revokedAt: this.now(), refreshTokenHash: null })
      .where(eq(devices.id, deviceId));
  }

  /** Called on every authenticated request: the token must match the user's token_version and a live device. */
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
