import { configured } from "@/lib/supabase";
import { requirePanel } from "@/lib/panels";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  let profile = null;
  try {
    profile = await requirePanel();
  } catch {
    redirect("/login");
  }
  return (
    <Workspace
      profile={profile}
      configured={configured()}
      timezone={process.env.APP_TIMEZONE || "Asia/Riyadh"}
      gpsThreshold={Number(process.env.GPS_ACCURACY_METERS || 20)}
    />
  );
}
