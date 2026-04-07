export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[boot] server starting");
    try {
      const { initScheduler } = await import("@/lib/scheduler");
      await initScheduler();
      console.log("[boot] scheduler initialized");
    } catch (err) {
      console.error("[boot] scheduler init failed:", err);
    }
  }
}
