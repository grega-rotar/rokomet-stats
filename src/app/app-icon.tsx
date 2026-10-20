import { ImageResponse } from "next/og";

// The wordmark's ball on a full RZS-blue square: the OS rounds or masks the corners itself.
export function appIcon(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#36a9e0" }}>
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M6.5 4.8c3.4 2.4 7.6 2.4 11 0M3.6 9.5c4.4.2 7.4 3.7 7.9 11.4M20.4 9.5c-4.4.2-7.4 3.7-7.9 11.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
