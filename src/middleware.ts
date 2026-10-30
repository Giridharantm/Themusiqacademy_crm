import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessAdminPath } from "@/lib/permissions";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && !canAccessAdminPath(role, pathname)) {
    // Front desk lands back on its own dashboard; anyone else goes home.
    return NextResponse.redirect(new URL(role === "FRONT_DESK" ? "/admin" : "/", req.nextUrl.origin));
  }
  if (pathname.startsWith("/teacher") && role !== "TEACHER") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  if (pathname.startsWith("/parent") && role !== "PARENT") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/parent/:path*", "/account/:path*"],
};
