import { ImageResponse } from "next/og";
import { logoSvg } from "@/lib/workspace-theme";

// The preview image for links to the app (sign-in, templates).
export const alt = "Daybar – a self-hosted day planner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const mark = logoSvg();

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "#fcfbf8", color: "#1d1c22" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`} width={84} height={84} alt="" />
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>daybar</span>
          
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Your day at a glance.</div>
          <div style={{ fontSize: 34, color: "#5e5a66", lineHeight: 1.3 }}>
            Tasks, events, habits and notes in one planner. Open source, on your own server.
          </div>
        </div>
        <div style={{ display: "flex", height: 10, width: 180, background: "#3b3fd8", borderRadius: 5 }} />
      </div>
    ),
    size,
  );
}
