import { Explorer } from "@/components/Explorer";
import { loadTimeline } from "@/lib/content";

export default function Home() {
  return <Explorer timeline={loadTimeline()} />;
}
