import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/login-form";
import { currentUser } from "@/lib/server-session";

const LoginPage = async () => {
  if ((await currentUser()) !== null) redirect("/returns");

  return <LoginForm />;
};

export default LoginPage;
