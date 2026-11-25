export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.EMAIL_WORKER !== "off") {
    const { iniciarWorkerEmail } = await import("./lib/email/worker");
    iniciarWorkerEmail();
  }
}
