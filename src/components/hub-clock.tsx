"use client";
import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

export default function HubClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return <div className="hub-clock" role="timer" aria-label="Live Riyadh date and time" aria-live="off">
    <CalendarClock size={22} aria-hidden="true" />
    <div><time dateTime={now?.toISOString()}>{now ? new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Riyadh", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:true}).format(now) : "—:—:—"}</time>
    <span>{now ? new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Riyadh", weekday:"short", day:"2-digit", month:"short", year:"numeric"}).format(now) : "Riyadh · UTC+3"}</span></div>
    <small>RIYADH</small>
  </div>;
}
