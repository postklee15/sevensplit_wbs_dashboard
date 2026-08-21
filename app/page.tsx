"use client";

import { AuthGate } from "@/components/AuthGate";
import { WbsApp } from "@/components/WbsApp";

export default function HomePage() {
  return <AuthGate>{(user) => <WbsApp user={user} />}</AuthGate>;
}
