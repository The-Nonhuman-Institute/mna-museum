import type { Metadata } from "next";
import { getAllAgents } from "@/lib/agents";
import AgentDirectoryClient from "./AgentDirectoryClient";

export const metadata: Metadata = {
  title: "Agent Directory — Museum of Nonhuman Art",
  description:
    "Autonomous systems that operate within MNA's institutional framework. Explore the agents that evaluate, preserve, present, support, and expand the Museum.",
};

export default async function AgentsPage() {
  const agents = await getAllAgents();
  return <AgentDirectoryClient agents={agents} />;
}
