// app\lib\helpers\notify.ts
import { ChangeDetail } from "@/models/schemas/notifications.schema";
import { getCentralConnection, isCentralForwardingEnabled } from "@/lib/centralDb";
import { CentralNotificationModel } from "@/models/factories/CentralNotification";
import { compressNotification, FullType } from "@/lib/helpers/notifyCompression";

// Cache TENANT_DB at module level for efficiency
const TENANT_DB = process.env.TENANT_DB || "UNKNOWN";

/**
 * Forward notification to XP_ERP central database
 * Includes single retry on failure for reliability
 */
async function forwardToCentral(data: {
  message: string;
  type?: FullType;
  resource?: string;
  resourceId?: string;
  action?: string;
  createdBy?: string;
  recipients?: string[];
}): Promise<void> {
  // Skip if forwarding is disabled
  if (!isCentralForwardingEnabled()) return;

  const compressed = compressNotification({
    tenantDb: TENANT_DB,
    ...data,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const conn = await getCentralConnection();
      if (!conn) return;

      const CN = CentralNotificationModel(conn);
      // MUST await in serverless - Vercel terminates unawaited promises
      await CN.create(compressed);
      return; // Success — exit
    } catch (err) {
      if (attempt === 0) {
        console.warn("[XP_ERP] Forward attempt 1 failed, retrying...", err);
      } else {
        console.error("[XP_ERP] Forward failed after retry:", err);
      }
    }
  }
}

export async function sendNotification({
  message,
  type = "info",
  resource,
  resourceId,
  action,
  createdBy,
  recipients, // optional array of usernames or ["all"]
  details, // optional structured ChangeRecord[]
  forwardCentral = true, // NEW: opt-out flag for central forwarding
}: {
  message: string;
  type?: "success" | "error" | "info" | "warning";
  resource?: string;
  resourceId?: string;
  action?: string;
  createdBy?: string;
  recipients?: string[]; 
  details?: ChangeDetail[];
  forwardCentral?: boolean;
}) {
  try {
    // Build promises array for parallel execution
    const promises: Promise<unknown>[] = [];

    // 1. Send to tenant's local notification system
    promises.push(
      fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          type,
          resource,
          resourceId,
          action,
          createdBy,
          recipients,
          details,
        }),
      })
    );

    // 2. Forward compressed copy to XP_ERP (in parallel, with timeout)
    if (forwardCentral) {
      const centralForward = forwardToCentral({
        message,
        type,
        resource,
        resourceId,
        action,
        createdBy,
        recipients,
      });

      // Timeout wrapper - don't let central forwarding block for more than 5s
      const withTimeout = Promise.race([
        centralForward,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);

      promises.push(withTimeout);
    }

    // Wait for all - allSettled ensures one failure doesn't break the other
    await Promise.allSettled(promises);
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}
