import { redirect } from "next/navigation";
import { currentUser } from "@/lib/server-session";

/** The root is not a page. Signed in goes to the returns list, signed out to login. */
const IndexPage = async () => {
  redirect((await currentUser()) === null ? "/login" : "/returns");
};

export default IndexPage;
