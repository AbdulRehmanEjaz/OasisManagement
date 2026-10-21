import { configured, requireUser } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  let profile = null;
  if (configured()) {
    try {
      profile = (await requireUser()).profile;
    } catch {
      redirect("/login");
    }
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
