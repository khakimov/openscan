import { z } from 'zod';

export const StartDiscoverySchema = z.object({
  target: z
    .string()
    .min(1, 'Target domain is required')
    .max(253, 'Domain name is too long')
    .toLowerCase()
    .regex(
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
      'Invalid domain format',
    )
    .refine(
      (val) => {
        const dangerous = /[;&|`$(){}[\]<>\\]|\.\.|^-/;
        return !dangerous.test(val);
      },
      { message: 'Domain contains invalid characters' },
    )
    .refine(
      (val) => {
        const blocked = ['localhost', '127.0.0.1', '0.0.0.0', 'local', 'internal'];
        return !blocked.some(
          (b) =>
            val === b ||
            val.endsWith(`.${b}`) ||
            val.includes('localhost') ||
            val.includes('127.0.0.1'),
        );
      },
      { message: 'Cannot scan internal or localhost domains' },
    ),
});

export type StartDiscoveryInput = z.infer<typeof StartDiscoverySchema>;
