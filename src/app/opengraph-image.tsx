import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SMM Agent dashboard preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "stretch",
          background: "#f2ecdf",
          color: "#171717",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            padding: 58,
            background:
              "linear-gradient(135deg, #f8f0df 0%, #e7d5b9 50%, #c79b55 100%)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              overflow: "hidden",
              borderRadius: 44,
              background: "#101722",
              border: "2px solid rgba(255,255,255,0.32)",
            }}
          >
            <div
              style={{
                width: "55%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: 58,
                background: "#fffaf2",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                <div
                  style={{
                    width: 96,
                    height: 96,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 22,
                    background:
                      "linear-gradient(145deg, #0e1520 0%, #17263a 100%)",
                  }}
                >
                  <div
                    style={{
                      width: 62,
                      height: 18,
                      borderRadius: 10,
                      background: "#f0d078",
                      transform: "rotate(-18deg)",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      fontFamily: "Arial, sans-serif",
                      color: "#171717",
                    }}
                  >
                    SMM Agent
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 19,
                      fontFamily: "Arial, sans-serif",
                      color: "#7d6b54",
                    }}
                  >
                    Social media management dashboard
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    fontSize: 84,
                    lineHeight: 0.92,
                    fontWeight: 700,
                    color: "#171717",
                  }}
                >
                  Plan, publish, and monitor every channel.
                </div>
                <div
                  style={{
                    marginTop: 30,
                    maxWidth: 520,
                    fontSize: 26,
                    lineHeight: 1.35,
                    fontFamily: "Arial, sans-serif",
                    color: "#6d5d49",
                  }}
                >
                  SMM Agent keeps posts, schedules, replies, approvals, and
                  platform connections in one workspace.
                </div>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                width: "45%",
                height: "100%",
                display: "flex",
                padding: 48,
                background:
                  "linear-gradient(145deg, #0e1520 0%, #142132 58%, #1d2e44 100%)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 74,
                  top: 86,
                  width: 360,
                  height: 34,
                  borderRadius: 18,
                  background: "#d2a35d",
                  opacity: 0.9,
                  transform: "rotate(-18deg)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 132,
                  top: 184,
                  width: 350,
                  height: 34,
                  borderRadius: 18,
                  background: "#f0d078",
                  opacity: 0.92,
                  transform: "rotate(-18deg)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 206,
                  top: 282,
                  width: 285,
                  height: 34,
                  borderRadius: 18,
                  background: "#fff1a6",
                  opacity: 0.9,
                  transform: "rotate(-18deg)",
                }}
              />
              <div
                style={{
                  alignSelf: "flex-end",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                  padding: 28,
                  borderRadius: 30,
                  background: "rgba(255,250,242,0.94)",
                }}
              >
                {["Create", "Calendar", "Social Inbox"].map((label, index) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "18px 20px",
                      borderRadius: 18,
                      background: index === 0 ? "#171717" : "#fffaf2",
                      color: index === 0 ? "#fffaf2" : "#171717",
                      border: "1px solid #e4d5c0",
                      fontFamily: "Arial, sans-serif",
                      fontSize: 22,
                      fontWeight: 700,
                    }}
                  >
                    <span>{label}</span>
                    <span>{index === 0 ? "Live" : "Ready"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
