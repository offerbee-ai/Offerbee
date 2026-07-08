import type { ReactNode } from "react";

/**
 * iPhone bezel wrapper (from the handoff's `phone()` helper). Renders at its
 * natural 300×620 size; `scale` applies a CSS transform for the hero (1.12)
 * and the smaller Onyx showcase phones (0.92).
 */
export function PhoneFrame({
  children,
  scale = 1,
  className = "",
}: {
  children: ReactNode;
  scale?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        width: 300,
        height: 620,
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: "center top",
        borderRadius: 46,
        background: "#0D0D0F",
        padding: 9,
        boxShadow:
          "0 30px 60px rgba(33,29,22,.22), 0 8px 20px rgba(33,29,22,.12)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 20,
          left: "50%",
          transform: "translateX(-50%)",
          width: 92,
          height: 24,
          background: "#0D0D0F",
          borderRadius: 14,
          zIndex: 5,
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 38,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}
