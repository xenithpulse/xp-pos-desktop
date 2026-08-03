// app/api/admin/server-config/updates/check/route.ts
//
// "Check for updates now" — runs the same check the agent runs on its timer.
//
// Public like the dashboard's other actions, but rate-limited. The check makes
// an outbound request and can pull a 118 MB installer behind it, so an endpoint
// anyone on the LAN can hit in a loop is a way to saturate a restaurant's
// connection during service. One check a minute is plenty for a human pressing
// a button.

import { NextResponse } from "next/server";
import { checkForUpdate } from "@/lib/updates/agent";
import { getUpdateSettings, isUpdateChannelEnabled } from "@/lib/updates/config";
import { readState } from "@/lib/updates/state";

export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 60_000;

export async function POST() {
  try {
    const settings = getUpdateSettings();
    if (!isUpdateChannelEnabled(settings)) {
      return NextResponse.json(
        {
          checked: false,
          message:
            "No update channel is configured on this box. Set POS_UPDATE_URL in " +
            "C:\\ProgramData\\XP POS\\.env and re-run provisioning to enable it.",
        },
        { status: 400 }
      );
    }

    const previous = await readState();
    if (previous.lastCheckAt) {
      const since = Date.now() - Date.parse(previous.lastCheckAt);
      if (Number.isFinite(since) && since < MIN_INTERVAL_MS) {
        return NextResponse.json(
          {
            checked: false,
            message: `Checked ${Math.round(since / 1000)}s ago. Try again in a minute.`,
          },
          { status: 429 }
        );
      }
    }

    const state = await checkForUpdate({ manual: true });
    return NextResponse.json({
      checked: true,
      reachable: state.reachable ?? null,
      available: state.available ?? null,
      downloadedVersion: state.downloaded?.version ?? null,
      detail: state.lastCheckError ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Update check failed" },
      { status: 500 }
    );
  }
}
