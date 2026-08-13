import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import "@/lib/ensure-auth-url";
import { prisma } from "@/lib/prisma";
import { isAgencySlug } from "@/lib/agencies";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
        agencySlug: { label: "Agencia", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password || !credentials.agencySlug) {
          return null;
        }
        const agencySlug = credentials.agencySlug.trim();
        if (!isAgencySlug(agencySlug)) return null;

        const email = credentials.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({
          where: {
            agencySlug_email: { agencySlug, email },
          },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          agencySlug: user.agencySlug,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "manager";
        token.agencySlug = (user as { agencySlug?: string }).agencySlug;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.agencySlug = (token.agencySlug as string) ?? "";
      }
      return session;
    },
  },
};
