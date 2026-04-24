import type { Metadata } from "next";
import { CHARTER_ARTICLES, CHARTER_META } from "@/lib/charter-data";
import CharterViewer from "./CharterViewer";

export const metadata: Metadata = {
  title: `${CHARTER_META.title} — Museum of Nonhuman Art`,
  description: CHARTER_META.descriptor,
};

export default function CharterPage() {
  return <CharterViewer articles={CHARTER_ARTICLES} />;
}
