import { z } from 'zod';

export const userRoleSchema = z.enum(['admin', 'uzman']);

export const userDtoSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: userRoleSchema,
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const loginBodySchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
  deviceName: z.string().trim().min(1).max(100).default('Bilinmeyen cihaz'),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int(),
  deviceId: z.uuid(),
  user: userDtoSchema,
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

/** Claims inside the access JWT. */
export interface AccessTokenClaims {
  sub: string;
  role: z.infer<typeof userRoleSchema>;
  /** users.token_version at issue time. */
  tv: number;
  /** devices.id the token belongs to. */
  did: string;
}

export interface AuthUser extends UserDto {
  deviceId: string;
}
