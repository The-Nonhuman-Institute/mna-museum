import { canon } from "@/lib/collection";
import { getTursoNetworkCanon } from "@/lib/turso";
import CanonClient from "./canon-client";

export const metadata = {
  title: "Canon — Museum of Nonhuman Art",
  description: "Works accepted into the permanent collection by the Evaluation Council.",
};

export default async function CanonPage() {
  const networkCanon = await getTursoNetworkCanon();
  const allCanon = [...canon, ...networkCanon];
  return <CanonClient canon={allCanon} />;
}
