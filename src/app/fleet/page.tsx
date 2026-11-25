import { redirect } from "next/navigation";
import { requireFleet } from "@/lib/fleet/store";
import FleetApp from "@/components/fleet/app";
import "@/app/kpi/kpi.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ADVACON · Vehicles Management",
  description:
    "Fleet vehicle registry, driver assignments, rent tracking, and fuel card limits.",
};

export default async function Page() {
  let profile;
  try {
    ({ profile } = await requireFleet(false));
  } catch {
    redirect("/fleet/login");
  }
  return <FleetApp profile={profile} />;
}
