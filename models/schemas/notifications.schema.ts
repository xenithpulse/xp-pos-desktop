import { Schema, Document, Types } from 'mongoose';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface ChangeDetail {
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface INotification extends Document {
  message: string;
  type: NotificationType;
  createdAt: Date;
  resource?: string;
  resourceId?: Types.ObjectId | string;
  action?: string;
  createdBy?: string;
  recipients?: string[];
  readBy?: string[]; 
  details?: ChangeDetail[];
}

export const ChangeDetailSchema: Schema<ChangeDetail> = new Schema(
  {
    field: String,
    oldValue: String,
    newValue: String,
  },
  { _id: false }
);

export const NotificationSchema: Schema<INotification> = new Schema(
  {
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['success', 'error', 'info', 'warning'],
      default: 'info',
    },
    resource: { type: String },
    resourceId: { type: Schema.Types.Mixed },
    action: { type: String },
    createdBy: { type: String },
    recipients: { type: [String], default: ['all'] }, 
    readBy: { type: [String], default: [] }, 
    details: { type: [ChangeDetailSchema], default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);