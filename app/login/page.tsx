import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export default function LoginPage() {
  if (cookies().get("chat_session")?.value === "authenticated") {
    redirect("/");
  }

  return <LoginForm />;
}