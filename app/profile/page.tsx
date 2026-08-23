"use client";

import { AuthGate } from "@/components/AuthGate";
import { ProfileGate } from "@/components/ProfileGate";
import { ProfileSettings } from "@/components/MyWorkBoard";

export default function ProfilePage() {
  return (
    <AuthGate>
      {(user) => (
        <ProfileGate user={user}>
          {({ profile, token, setProfile }) => (
            <ProfileSettings token={token} profile={profile} onProfileChange={setProfile} />
          )}
        </ProfileGate>
      )}
    </AuthGate>
  );
}
