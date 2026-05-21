import * as Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(4000),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),

  ENCRYPTION_KEY: Joi.string().min(32).required()
    .description('32 bytes base64 — used for AES-256-GCM key wrapping'),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),

  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  CORS_ORIGINS: Joi.string().allow('').default(''),
}).unknown(true);

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const { value, error } = schema.validate(env, { abortEarly: false, convert: true });
  if (error) {
    throw new Error(
      `Configuration validation error:\n  - ${error.details
        .map((d) => d.message)
        .join('\n  - ')}`,
    );
  }
  return value;
}
