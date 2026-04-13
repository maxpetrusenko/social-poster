export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[boot] server starting");
    try {
      const { initScheduler } = await import("@/lib/scheduler");
      const { primeDashboardCandidates } = await import("@/lib/dashboard/candidates");
      await initScheduler();
      void primeDashboardCandidates()
        .then(() => console.log("[boot] candidate cache ready"))
        .catch((err) => console.error("[boot] candidate cache prime failed:", err));
      console.log("[boot] scheduler initialized");
    } catch (err) {
      console.error("[boot] scheduler init failed:", err);
    }
  }
}
