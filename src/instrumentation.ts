// Runs once when the server starts, before it handles requests (specs/deployment.md, step 4).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runMigrations } = await import("./db");
  runMigrations();
}
