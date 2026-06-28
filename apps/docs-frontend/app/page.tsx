import { getDocsIndex, recentlyUpdated, summarizeDocs, summarizePage } from "@/lib/docs";
import { HomeContent } from "@/components/home-content";

export default function IndexPage() {
  const index = getDocsIndex();
  const summary = summarizeDocs(index);
  const recent = recentlyUpdated(index, 5).map(summarizePage);

  return <HomeContent index={summary} recent={recent} />;
}
