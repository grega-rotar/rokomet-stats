import { Shell } from "../shell";

// Every signed-in page (chat, stats) sits next to the same sidebar.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <Shell>{children}</Shell>;
}
