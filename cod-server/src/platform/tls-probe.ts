import tls from "node:tls";

export type CertificateStatus =
  | { status: "active"; trusted: boolean; issuer: string | null; validTo: string }
  | { status: "missing" }
  | { status: "error"; message: string };

export function probeCertificate(
  hostname: string,
  { host = hostname, port = 443, timeoutMs = 4000 }: { host?: string; port?: number; timeoutMs?: number } = {},
): Promise<CertificateStatus> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs });
    const done = (result: CertificateStatus) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) return done({ status: "missing" });
      const coversHost = tls.checkServerIdentity(hostname, cert) === undefined;
      if (!coversHost) return done({ status: "missing" });
      done({
        status: "active",
        trusted: socket.authorized,
        issuer: (cert.issuer?.O as string | undefined) ?? (cert.issuer?.CN as string | undefined) ?? null,
        validTo: new Date(cert.valid_to).toISOString(),
      });
    });
    socket.once("timeout", () => done({ status: "missing" }));
    socket.once("error", (err: NodeJS.ErrnoException) =>
      done(err.code === "ECONNREFUSED" || /alert|handshake/i.test(err.message) ? { status: "missing" } : { status: "error", message: err.code ?? err.message }),
    );
  });
}
