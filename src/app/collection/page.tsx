import { Shelf } from "../../components/Shelf";
import { Shell } from "../../components/Shell";

export const metadata = { title: "Shelf" };

export default function CollectionPage() {
  return (
    <Shell>
      <Shelf />
    </Shell>
  );
}
