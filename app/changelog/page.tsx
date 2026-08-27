"use client";

import { AuthGate } from "@/components/AuthGate";
import { ChangeLogBoard } from "@/components/ChangeLogBoard";
import { ProfileGate } from "@/components/ProfileGate";

export default function ChangeLogPage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {() => <ChangeLogBoard />}
        </ProfileGate>
      )}
    </AuthGate>
  );
}
