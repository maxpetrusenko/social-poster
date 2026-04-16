import React from "react";

interface BrowserChromeProps {
  url: string;
  children: React.ReactNode;
}

export const BrowserChrome: React.FC<BrowserChromeProps> = ({ url, children }) => {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f5f5f5",
        fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 40,
          backgroundColor: "#e8e8e8",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#ff5f57" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#febc2e" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#28c840" }} />
      </div>

      {/* URL bar */}
      <div
        style={{
          height: 44,
          backgroundColor: "#e8e8e8",
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid #d4d4d4",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 30,
            backgroundColor: "#ffffff",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 13,
            color: "#555",
          }}
        >
          <span style={{ color: "#28c840", marginRight: 6, fontSize: 12 }}>🔒</span>
          <span style={{ color: "#999" }}>https://</span>
          <span style={{ color: "#333", fontWeight: 500 }}>{url}</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>{children}</div>
    </div>
  );
};
