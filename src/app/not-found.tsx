import Link from "next/link";
import { Shell } from "../components/Shell";

export default function NotFound() {
  return (
    <Shell>
      <p className="kicker">404</p>
      <h1 className="display mt-3 text-4xl">That card isn't in the deck.</h1>
      <p className="lede mt-4">The id may have left this snapshot.</p>
      <Link className="btn btn-primary mt-6" href="/dex">
        Back to the dex
      </Link>
    </Shell>
  );
}
