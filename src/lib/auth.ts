import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseLoginId } from "@/lib/login";
import { findLearnerLoginsByPhone } from "@/lib/learner-logins";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Needed once this runs behind a reverse proxy (Docker/VPS deployments) so
  // NextAuth trusts the forwarded host/proto headers instead of rejecting
  // the request. Harmless locally.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        // The "email" box takes an email address (staff) or a phone number
        // (students, parents, guardians).
        const loginId = parseLoginId(credentials?.email as string | undefined);
        const password = credentials?.password as string | undefined;
        if (!loginId || !password) return null;

        const candidates =
          loginId.kind === "email"
            ? [await prisma.user.findUnique({ where: { email: loginId.email } })]
            : await findLearnerLoginsByPhone(loginId.phone);

        for (const user of candidates) {
          if (!user || user.status === "INACTIVE") continue;
          if (await bcrypt.compare(password, user.passwordHash)) {
            return { id: user.id, name: user.name, email: user.email, role: user.role };
          }
        }
        return null;
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        (session.user as { role?: string; id?: string }).role = token.role as string;
        (session.user as { role?: string; id?: string }).id = token.id as string;
      }
      return session;
    },
  },
});
