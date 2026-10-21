import "server-only";
import { privileged } from "./supabase";
export async function sendNotification(recordId: string, kind: string) {
  const db = privileged();
  const { data: claim, error } = await db.rpc("claim_delivery", {
    p_record_id: recordId,
    p_record_type: kind,
    p_recipient: process.env.MANAGER_EMAIL || "unconfigured",
  });
  if (error || !claim) return;
  const delivery = claim as { id: string; attempts: number };
  try {
    if (
      !process.env.RESEND_API_KEY ||
      !process.env.MANAGER_EMAIL ||
      !process.env.RESEND_FROM_EMAIL ||
      !process.env.APP_URL
    )
      throw new Error("Email configuration is incomplete.");
    const table = kind === "waste" ? "waste_reports" : "facility_inspections";
    const { data: record, error: readError } = await db
      .from(table)
      .select("*,profiles!supervisor_id(full_name)")
      .eq("id", recordId)
      .single();
    if (readError || !record) throw new Error("Report unavailable.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `${delivery.id}-${delivery.attempts}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: process.env.MANAGER_EMAIL,
        subject: `${kind === "waste" ? "Oasis Waste" : "OnSite Facilities"} · ${record.number}`,
        text: `${record.number}\nSupervisor: ${record.profiles?.full_name}\n${record.facility_id ? `Facility: ${record.facility_id}` : record.category}\nSubmitted: ${record.created_at}\n${process.env.APP_URL}/?view=${kind === "waste" ? "waste" : "inspections"}&record=${recordId}`,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Email provider rejected the request.");
    await db
      .from("delivery_attempts")
      .update({
        status: "sent",
        provider_message_id: result.id,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
  } catch (e) {
    await db
      .from("delivery_attempts")
      .update({
        status: "failed",
        last_error: e instanceof Error ? e.message : "Email failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
  }
}
