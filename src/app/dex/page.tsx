import { DexBrowser } from "../../components/DexBrowser";
import { Shell } from "../../components/Shell";

export const metadata = { title: "Dex" };

export default function DexPage() {
  return (
    <Shell>
      <DexBrowser />
    </Shell>
  );
}
