import localtunnel from "localtunnel";

const PORT = 8080;

async function start() {
  console.log(`[tunnel] Connecting localtunnel to port ${PORT}...`);
  try {
    const tunnel = await localtunnel({ port: PORT });
    console.log(`\n========================================`);
    console.log(`PUBLIC_HTTPS_URL: ${tunnel.url}`);
    console.log(`========================================\n`);

    tunnel.on("close", () => {
      console.log("[tunnel] Tunnel closed. Reconnecting in 3s...");
      setTimeout(start, 3000);
    });

    tunnel.on("error", (err) => {
      console.error("[tunnel] Error:", err.message);
    });
  } catch (err) {
    console.error("[tunnel] Failed to connect:", err.message);
    setTimeout(start, 5000);
  }
}

start();
