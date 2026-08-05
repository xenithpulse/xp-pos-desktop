// app/hub/page.tsx
//
// Kept alive purely as a redirect. The screen moved to /dine-in in Phase 16 §3;
// this route stays because desktop shortcuts, printed cards and bookmarks on
// staff tablets all point at /hub, and a dead link on a till during service
// turns a rename into a support call.
//
// Permanent, so browsers and the shortcut stop asking. Do not add UI here.

import { permanentRedirect } from "next/navigation";

export default function HubPage(): never {
  permanentRedirect("/dine-in");
}
