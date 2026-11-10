import type { ValueTransformer } from 'typeorm';

/** Postgres bigint comes back as string; cents always fit in a JS safe integer. */
export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/** Postgres numeric comes back as string; quantities and VAT rates are small decimals. */
export const numericToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

export const ULID_COLUMN = { type: 'char', length: 26 } as const;
export const CLERK_USER_ID_COLUMN = { type: 'varchar', length: 32 } as const;
