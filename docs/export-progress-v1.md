# Export progress and cancellation v1

`runExportBatches` processes export work in positive-integer batches. It calls
the progress callback after each completed batch, yields through an injectable
browser boundary between batches, and checks an optional `AbortSignal` before
starting each batch. A cancellation after a batch completes stops before the
next batch; processor exceptions become structured failed results.

The default yield uses `requestAnimationFrame` when available and falls back to
a zero-delay timer for non-rendering environments. Invalid batch sizes are
rejected before work begins.
