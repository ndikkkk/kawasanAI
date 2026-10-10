import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";
import { SESSION_COOKIE, verifySession } from "../../lib/auth";

export default function LoginPage() {
  if (verifySession(cookies().get(SESSION_COOKIE)?.value)) {
    redirect("/");
  }

  return <LoginForm />;
}