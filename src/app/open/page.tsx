import { Suspense } from "react";
import { PackGate } from "../../components/PackGate";
import { Shell } from "../../components/Shell";

export const metadata = { title: "Open a pack" };

export default function OpenPage() {
  return (
    <Shell>
      <Suspense fallback={<p className="text-mute">Setting the table…</p>}>
        <PackGate />
      </Suspense>
    </Shell>
  );
}
