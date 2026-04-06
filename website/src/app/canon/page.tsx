import { getCanonWorks } from "@/lib/collection";
import CanonClient from "./canon-client";

export const metadata = {
  title: "Canon — Museum of Nonhuman Art",
  description: "Works accepted into the permanent collection by the Evaluation Council.",
};

export default async function CanonPage() {
  const allCanon = await getCanonWorks();
  return <CanonClient canon={allCanon} />;
}
