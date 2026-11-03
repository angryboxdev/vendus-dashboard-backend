process.once("message", () => process.send({ ok: false, error: "PDF corrompido" }, () => process.exit(0)));
