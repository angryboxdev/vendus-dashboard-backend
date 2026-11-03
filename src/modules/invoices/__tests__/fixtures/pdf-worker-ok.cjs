process.once("message", (req) => process.send({ ok: true, result: req.op === "extractLogo" ? { png: new Uint8Array([1, 2, 3]), width: 2, height: 1 } : { echoed: req.op } }, () => process.exit(0)));
