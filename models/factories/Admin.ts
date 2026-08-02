// models\factories\Admin.ts

import { Connection, Model } from "mongoose";
import { AdminSchema, IAdmin, ROLE_PERMISSIONS } from "../schemas/admin.schema";

AdminSchema.pre<IAdmin>("save", function () {
  if (this.isModified("role")) {
    this.permissions = ROLE_PERMISSIONS[this.role] || [];
  }
});

export function AdminModel(conn: Connection): Model<IAdmin> {
  return (
    conn.models.Admin ||
    conn.model<IAdmin>("Admin", AdminSchema)
  );
}
