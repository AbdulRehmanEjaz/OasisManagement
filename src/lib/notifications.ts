import { D1Store } from "./d1-store";
export async function sendNotification(db: D1Store, recordId: string) {
  const claim = crypto.randomUUID(),
    now = new Date().toISOString();
  // A durable claim prevents concurrent retries. Never automatically reclaim a
  // stale claim: a crash after provider acceptance needs manual log reconciliation.
  const delivery = await db.one(
    `UPDATE delivery_attempts SET claim_token=?,claimed_at=?,attempts=attempts+1,updated_at=? WHERE record_id=? AND status IN ('pending','failed') AND claim_token IS NULL RETURNING *`,
    claim,
    now,
    now,
    recordId,
  );
  if (!delivery) return;
  try {
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.MANAGER_EMAIL ||
      !process.env.RESEND_FROM_EMAIL ||
      !process.env.APP_URL
    )
      throw new Error("Email configuration is incomplete.");
    const record = await db.one(
      "SELECT r.*,u.full_name FROM reports r JOIN users u ON u.id=r.supervisor_id WHERE r.id=?",
      recordId,
    );
    if (!record) throw new Error("Report unavailable.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": delivery.id,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: process.env.MANAGER_EMAIL,
        subject: `${record.kind === "waste" ? "Oasis Waste" : "OnSite Facilities"} · ${record.number}`,
        text: `${record.number}\nSupervisor: ${record.full_name}\nSubmitted: ${record.created_at}\n${process.env.APP_URL}/survey?view=${record.kind === "waste" ? "waste" : "inspections"}&record=${record.id}`,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error("Email provider rejected the request.");
    await db
      .stmt(
        "UPDATE delivery_attempts SET status='sent',provider_message_id=?,recipient=?,last_error=NULL,claim_token=NULL,updated_at=? WHERE id=? AND claim_token=?",
        result.id,
        process.env.MANAGER_EMAIL,
        new Date().toISOString(),
        delivery.id,
        claim,
      )
      .run();
  } catch (e) {
    await db
      .stmt(
        "UPDATE delivery_attempts SET status='failed',last_error=?,claim_token=NULL,updated_at=? WHERE id=? AND claim_token=?",
        e instanceof Error && e.message === "Email configuration is incomplete."
          ? e.message
          : "Email delivery failed. Check provider logs before retrying.",
        new Date().toISOString(),
        delivery.id,
        claim,
      )
      .run();
  }
}
