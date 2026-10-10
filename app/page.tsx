import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Chat from "./chat";
import { SESSION_COOKIE, verifySession } from "../lib/auth";

export default function Home() {
  const session = verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) {
    redirect("/login");
  }

  return <Chat key={session.subject} />;
}