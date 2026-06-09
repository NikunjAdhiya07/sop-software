import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/training-matrix/:path*",
    "/employees/:path*",
    "/compliance/:path*",
    "/sop-scheduler/:path*",
    "/training-content/:path*",
  ],
};
