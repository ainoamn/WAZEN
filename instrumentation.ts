export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportEvent } = await import("./lib/observability");
    process.on("unhandledRejection", (reason) => {
      reportEvent({ level: "error", code: "UNHANDLED_REJECTION", error: reason });
    });
    process.on("uncaughtException", (error) => {
      reportEvent({ level: "error", code: "UNCAUGHT_EXCEPTION", error });
    });
  }
}
