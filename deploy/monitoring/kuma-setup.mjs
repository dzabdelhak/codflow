const { KUMA_URL, KUMA_USERNAME, KUMA_PASSWORD } = process.env;
const socketUrl = `${KUMA_URL.replace(/^http/, "ws")}/socket.io/?EIO=4&transport=websocket`;

function attempt() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socketUrl);
    const timer = setTimeout(() => finish(reject, new Error("no answer")), 15_000);
    const finish = (settle, value) => {
      clearTimeout(timer);
      ws.close();
      settle(value);
    };
    ws.onerror = () => finish(reject, new Error("cannot connect"));
    ws.onmessage = ({ data }) => {
      const text = String(data);
      if (text === "2") return ws.send("3");
      if (text.startsWith("0")) return ws.send("40");
      if (text.startsWith("40")) return ws.send(`420${JSON.stringify(["needSetup"])}`);
      if (text.startsWith("430")) {
        const [needed] = JSON.parse(text.slice(3));
        if (!needed) return ws.send(`422${JSON.stringify(["login", { username: KUMA_USERNAME, password: KUMA_PASSWORD, token: "" }])}`);
        return ws.send(`421${JSON.stringify(["setup", KUMA_USERNAME, KUMA_PASSWORD])}`);
      }
      if (text.startsWith("432")) {
        const [answer] = JSON.parse(text.slice(3));
        return answer?.ok
          ? finish(resolve, "Uptime Kuma: admin already set up, credentials accepted")
          : finish(reject, Object.assign(new Error("KUMA_ADMIN_USER / KUMA_ADMIN_PASSWORD do not match Kuma's admin: change the password in Kuma (Settings → Security) to the secrets file's value"), { final: true }));
      }
      if (text.startsWith("431")) {
        const [answer] = JSON.parse(text.slice(3));
        return answer?.ok ? finish(resolve, "Uptime Kuma: admin created") : finish(reject, new Error(answer?.msg ?? "setup refused"));
      }
    };
  });
}

for (let tries = 1; ; tries++) {
  try {
    console.log(await attempt());
    process.exit(0);
  } catch (err) {
    if (err.final || tries >= 40) {
      console.error(`Uptime Kuma setup failed: ${err.message}`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}
