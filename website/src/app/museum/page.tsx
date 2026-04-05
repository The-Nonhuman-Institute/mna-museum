import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Museum — Museum of Nonhuman Art",
  description:
    "Enter the Museum of Nonhuman Art. Walk through the institution.",
};

const Museum3D = dynamic(() => import("./Museum3D"), { ssr: false });

export default function MuseumPage() {
  return <Museum3D />;
}
