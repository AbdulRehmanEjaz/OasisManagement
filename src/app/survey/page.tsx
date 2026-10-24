import { requirePanel } from "@/lib/panels";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  let profile;
  try {
    profile = await requirePanel();
  } catch {
    redirect("/survey/login");
  }
  const { tokenHash: _, ...safeProfile } = profile;
  return (
    <Workspace
      profile={safeProfile}
      configured={true}
      timezone={process.env.APP_TIMEZONE || "Asia/Riyadh"}
      gpsThreshold={Number(process.env.GPS_ACCURACY_METERS || 20)}
    />
  );
}
