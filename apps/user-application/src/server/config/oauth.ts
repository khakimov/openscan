import { z } from "zod";

const googleOAuthConfigSchema = z.object({
  clientId: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  clientSecret: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  redirectUri: z.string().url("GOOGLE_REDIRECT_URI must be a valid URL"),
});

export type GoogleOAuthConfig = z.infer<typeof googleOAuthConfigSchema>;

let _cachedGoogleConfig: GoogleOAuthConfig | null = null;

/**
 * Get validated Google OAuth configuration from environment variables
 * Memoized to avoid repeated validation
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  if (_cachedGoogleConfig) {
    return _cachedGoogleConfig;
  }

  const result = googleOAuthConfigSchema.safeParse({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new Error(`Google OAuth configuration error: ${errors}`);
  }

  _cachedGoogleConfig = result.data;
  return _cachedGoogleConfig;
}
