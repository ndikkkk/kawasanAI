import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Chat from "./chat";

export default function Home() {
  if (cookies().get("chat_session")?.value !== "authenticated") {
    redirect("/login");
  }

  return <Chat />;
}