import { z } from "zod";

// Rebuy Schema
export const rebuySchema = z.object({
  amount: z.number().positive("Amount must be positive"),
});

// Deal Hand Schema
export const dealHandSchema = z.object({
  roomId: z.string().uuid("Invalid room ID"),
});

// Submit Action Schema - Using discriminated union for type-safe action validation
const baseActionSchema = z.object({
  roomId: z.string().uuid("Invalid room ID"),
  seatNumber: z.number().int().min(0).max(11, "Invalid seat number"),
});

export const submitActionSchema = z.discriminatedUnion("actionType", [
  baseActionSchema.extend({
    actionType: z.literal("fold"),
  }),
  baseActionSchema.extend({
    actionType: z.literal("check"),
  }),
  baseActionSchema.extend({
    actionType: z.literal("call"),
  }),
  baseActionSchema.extend({
    actionType: z.literal("bet"),
    amount: z.number().positive("Bet amount must be positive"),
  }),
  baseActionSchema.extend({
    actionType: z.literal("raise"),
    amount: z.number().positive("Raise amount must be positive"),
  }),
  baseActionSchema.extend({
    actionType: z.literal("all_in"),
  }),
]);

// Resolve Hand Schema
export const resolveHandSchema = z.object({
  roomId: z.string().uuid("Invalid room ID"),
});
