import { z } from 'zod';

/** All ids are opaque strings; the mock store issues prefixed sequential ids. */
export const idSchema = z.string().min(1);
export type Id = z.infer<typeof idSchema>;

/** ISO-8601 timestamp, e.g. 2026-08-16T09:30:00.000Z */
export const timestampSchema = z.string().min(1);
export type Timestamp = z.infer<typeof timestampSchema>;

/** Business day, e.g. 2026-08-16 (no time component, no timezone drift). */
export const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type BusinessDate = z.infer<typeof businessDateSchema>;

/** Money is a plain number in major units (₹). Round through `roundMoney`. */
export const moneySchema = z.number().finite();
export const quantitySchema = z.number().finite();

export const auditableSchema = z.object({
  createdAt: timestampSchema,
  createdBy: idSchema,
  updatedAt: timestampSchema.optional(),
  updatedBy: idSchema.optional(),
});
export type Auditable = z.infer<typeof auditableSchema>;

export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export const roundQty = (value: number): number => Math.round(value * 1000) / 1000;
