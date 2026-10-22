import { PageLoader } from "@shared/ui/brand-loader";

/** Shown while a route segment loads (e.g. moving between sections). */
export default function Loading() {
  return <PageLoader fullScreen />;
}
