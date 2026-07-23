"use client";

import { useState } from "react";

import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";
import { authClient } from "@/lib/auth-client";

import Chat from "./Chat";

export default function SupportPage() {
  const { data: session, isPending } = authClient.useSession();
  const [showSignIn, setShowSignIn] = useState(true);

  // Until the session resolves, stay dormant rather than opening a stream
  // against a half-known identity.
  if (isPending) return <Loader />;

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8">
        {showSignIn ? (
          <SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
        ) : (
          <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
        )}
      </div>
    );
  }

  // `session.user.id` is the web-lane session key: stable per signed-in user and
  // tagged with the `web:` prefix inside `Chat` so `route` authorizes it.
  return <Chat userId={session.user.id} />;
}
