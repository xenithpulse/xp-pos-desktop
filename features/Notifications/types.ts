
export type NotificationType = "success" | "error" | "info" | "warning";

export interface ChangeDetail {
  field: string;
  oldValue?: string;
  newValue?: string;
}

export interface Notification {
  _id: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  resource?: string;
  action?: string;
  createdBy?: string;
  details?: ChangeDetail[];
  isRead?: boolean;
  visible?: boolean;
}