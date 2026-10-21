# Optional future R2 photo migration (not enabled)

ImgBB remains the current host. No bucket, paid resource or R2 binding is created.
If you later choose R2, first review its current quota/pricing and explicitly
approve the account resource changes.

A separate migration should add a private R2 bucket binding, replace the ImgBB
transport after the existing image validation/conversion, and store immutable
object keys with upload ownership in D1. Keep the bucket private. Serve photos
through an authenticated Worker route that checks the session and Admin/Viewer
report access; Supervisors remain submit-only. Never expose a public bucket or
R2 management credentials to the browser.

Copy existing ImgBB objects in a controlled job, verify checksums and availability,
and map existing photo metadata IDs to object keys so reports retain their photo
associations. Keep ImgBB URLs as a rollback source until verification passes.
Add lifecycle/orphan cleanup and tests for unauthorized access, content types,
size limits, deletion and rollback. Do not rewrite historical reports or GPS.
