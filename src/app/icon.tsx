import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  const s = 512;
  const bars = [0.3, 0.6, 0.9, 0.55, 0.3];
  return new ImageResponse(
    (
      <div style={{ width: s, height: s, background: "#0b0d12", display: "flex", alignItems: "center", justifyContent: "center", gap: s * 0.05 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ width: s * 0.08, height: s * 0.7 * h, background: "#3ee6b0", borderRadius: s * 0.04 }} />
        ))}
      </div>
    ),
    size,
  );
}
