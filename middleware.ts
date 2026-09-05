import { withAuth } from "next-auth/middleware";

// Protects every /chat route at the edge - unauthenticated requests never
// reach the page component. This is a UX convenience, not the
// authorization boundary itself; every API route independently calls
// requireUser() + assertConversationMember() (see README "Authorization"),
// so this middleware being bypassed would not expose any data.
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: ["/chat/:path*"],
};
