// components/ui/QrCode.tsx
//
// A QR code as inline SVG.
//
// SVG rather than a canvas or a data URL because it prints crisply at any size,
// and printing is a first-class use here: the connection card goes on the wall
// by the pass. A canvas would print at screen resolution and a data URL would
// need a round trip to generate.
//
// Error correction is set to M, which tolerates a smudged or partly covered
// print without inflating the module count enough to hurt scanning at the size
// a phone is held from a monitor.
//
// Shared by the login screen and Server Management -> Connect Devices. Both
// show the same address to the same person for the same reason, and two
// implementations would drift.

"use client";

import qrcode from "qrcode-generator";

export default function QrCode({
  text,
  size = 232,
  className = "",
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const cells: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) cells.push(`M${c},${r}h1v1h-1z`);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${text}`}
      // The white plate is not decoration. A scanner needs the light modules to
      // be light, and this renders on a black page - without it the code is
      // unreadable on screen and invisible on paper.
      className={`rounded-lg bg-white p-3 ${className}`}
    >
      <path d={cells.join("")} fill="#000000" />
    </svg>
  );
}
