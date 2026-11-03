// Bloqueia o processador (como um PDF que prende o jsqr/pdfjs): o timer do pai nunca seria servido num único processo.
process.once("message", () => { for (;;) { /* ciclo infinito */ } });
