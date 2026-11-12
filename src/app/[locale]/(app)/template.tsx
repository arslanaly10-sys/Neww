import { Reveal } from "@/components/motion";

/** A template re-mounts on every navigation, so each page's content fades and lifts in as it arrives. */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  return <Reveal y={6}>{children}</Reveal>;
}
