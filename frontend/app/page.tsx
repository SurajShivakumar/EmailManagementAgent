import { Suspense } from "react";
import { EmailList } from "@/components/EmailList";

export default function Home() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-400">Loading inbox…</p>}>
      <EmailList />
    </Suspense>
  );
}
