import { spawn } from "child_process";

function launch() {
  console.log("[cf-tunnel] Launching Cloudflare tunnel...");
  const child = spawn(
    "npx",
    ["-y", "cloudflared", "tunnel", "--protocol", "http2", "--url", "http://127.0.0.1:8080"],
    { shell: true }
  );

  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));

  child.on("close", (code) => {
    console.log(`[cf-tunnel] Tunnel process closed with code ${code}. Reconnecting in 3 seconds...`);
    setTimeout(launch, 3000);
  });

  child.on("error", (err) => {
    console.error("[cf-tunnel] Process error:", err.message);
  });
}

launch();
