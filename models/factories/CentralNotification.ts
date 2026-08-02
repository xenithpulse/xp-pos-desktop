// models/factories/CentralNotification.ts
// Factory for XP_ERP central notification model

import { Model, Connection } from "mongoose";
import { 
  ICentralNotification, 
  CentralNotificationSchema 
} from "../schemas/centralNotification.schema";

/**
 * Get CentralNotification model for the XP_ERP connection
 * Model name is also shortened: "CN" (CentralNotification)
 */
export function CentralNotificationModel(conn: Connection): Model<ICentralNotification> {
  return (
    conn.models.CN ||
    conn.model<ICentralNotification>("CN", CentralNotificationSchema)
  );
}
