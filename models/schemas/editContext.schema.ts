import { Schema, Document } from 'mongoose';

/**
 * Per-user daily-sheet editing context. Persists which day a user is currently
 * working on (today = null, or a backdated `YYYY-MM-DD`) so the choice follows
 * them across devices/sessions. One document per user.
 */
export interface IEditContext extends Document {
  userId: string;
  username?: string;
  /** `null` = today; otherwise a PKT `YYYY-MM-DD` backdate. */
  targetDate?: string | null;
}

export const EditContextSchema = new Schema<IEditContext>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    username: { type: String },
    targetDate: { type: String, default: null },
  },
  { timestamps: true }
);
