import { Model, Connection } from 'mongoose';
import { INotification, NotificationSchema } from '../schemas/notifications.schema';

export function NotificationModel(conn: Connection): Model<INotification> {
  return (
    conn.models.Notification ||
    conn.model<INotification>('Notification', NotificationSchema)
  );
}